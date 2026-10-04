#!/usr/bin/env node

import '../../lib/prefer-ipv4.js';

/**
 * Facebook digest cover image.
 *
 * Picks the single most scroll-stopping news block, generates one text-free
 * 4:5 photograph, and writes it for the Facebook feed post. No overlay text.
 *
 * Image vendor: Cloudflare Workers AI is primary for Facebook covers.
 * Override with COVER_IMAGE_VENDOR; reel stills use IMAGE_VENDOR (Cloudflare when keys exist).
 *
 * Usage:
 *   node production/image/src/generate-digest-cover.js latest
 *   node production/image/src/generate-digest-cover.js <digest-id>
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import OpenAI from 'openai';
import { fal } from '@fal-ai/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import {
  findLatestDigestId,
  initDigestStore,
  persistDigestFields,
  resolvePipelineDbPath,
  resolvePublicBaseUrl,
} from '../../lib/digest-store.js';
import { getDigestContent } from '../../lib/digest.js';
import {
  COVER_ASPECT,
  digestCoverFilename,
  imagePayloadToBuffer,
  selectDigestCover,
} from '../../lib/digest-cover.js';
import {
  generateImage,
  generateImageWithRetry,
  resolveCoverImageFallbackVendors,
  resolveCoverImageVendor,
  safeLogUrl,
} from '../../lib/image-backends.js';
import { reviewCoverImage } from '../../lib/cover-image-review.js';
import { completeJsonText, completeJsonWithImage } from '../../lib/llm-client.js';
import { log, projectRoot, reportFatal, scriptDir } from '../../lib/logging.js';

const __dirname = scriptDir(import.meta.url);
const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

fal.config({ credentials: process.env.FAL_KEY });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init' });
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-init' });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'dummy-key-for-init');

const SERVER = resolvePublicBaseUrl();
const OUTPUT_DIR = join(__dirname, '..', 'output');
const DB_PATH = resolvePipelineDbPath();

async function completeJson(systemPrompt, userPrompt) {
  return completeJsonText(systemPrompt, userPrompt, {
    maxTokens: 1024,
    title: 'NiSeNews digest cover',
  });
}

async function saveCoverImage(imageUrl, filepath) {
  const fromData = imagePayloadToBuffer(imageUrl);
  if (fromData) {
    writeFileSync(filepath, fromData);
    return;
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download cover image (${response.status})`);
  writeFileSync(filepath, Buffer.from(await response.arrayBuffer()));
}

async function inspectCoverImage(systemPrompt, userPrompt, { mediaType, base64 } = {}) {
  return JSON.stringify(await completeJsonWithImage(systemPrompt, userPrompt, {
    mediaType,
    base64,
    maxTokens: 256,
    title: 'NiSeNews digest cover review',
  }));
}

function coverReviewAttempts() {
  const n = Number(process.env.COVER_IMAGE_REVIEW_MAX_ATTEMPTS || 3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

async function persistCoverUrl(digestId, publicUrl) {
  let id = digestId !== 'latest' ? digestId : null;
  try {
    initDigestStore(DB_PATH);
    if (!id) {
      id = findLatestDigestId();
    }
    if (id) {
      persistDigestFields(id, { image_url: publicUrl });
      log(`Stored cover URL for digest ${id}: ${publicUrl}`);
    }
  } catch (err) {
    console.error('[update] Failed to store cover URL:', err.message);
  }
}

function coverFallbackEnabled(primaryVendor) {
  const raw = String(process.env.COVER_IMAGE_ALLOW_FALLBACK ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return resolveCoverImageFallbackVendors(primaryVendor).length > 0;
}

async function generateCoverImage(prompt, vendor, imageDeps, { allowFallback = false } = {}) {
  const withRetry = vendor === 'openrouter' || vendor === 'firefly' || vendor === 'cloudflare';
  const maxRetries = vendor === 'cloudflare'
    ? (allowFallback
      ? Math.max(1, Number(process.env.COVER_IMAGE_MAX_RETRIES || 1))
      : Math.max(3, Number(process.env.COVER_IMAGE_MAX_RETRIES || process.env.IMAGE_MAX_RETRIES || 5)))
    : Math.max(0, Number(process.env.IMAGE_MAX_RETRIES || 3));
  const run = () => generateImage(prompt, {
    ...imageDeps,
    vendor,
    ...(vendor === 'openrouter'
      ? { model: process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro' }
      : {}),
  });
  if (withRetry) {
    return generateImageWithRetry(run, { log: imageDeps.log, label: 'Cover', maxRetries });
  }
  return run();
}

async function main() {
  const args = process.argv.slice(2);
  const digestId = args.find((arg) => !arg.startsWith('--')) || 'latest';

  mkdirSync(OUTPUT_DIR, { recursive: true });

  log(`Fetching digest: ${digestId}`);
  const digestText = await getDigestContent(digestId, { log });
  log(`Digest: ${digestText.length} chars`);

  log('Selecting top news for the Facebook cover...');
  const cover = await selectDigestCover(digestText, { completeJson, log });
  log(`  Fact: ${(cover.coreFact || '').slice(0, 120)}`);
  log(`  Subject: ${(cover.visualSubject || '').slice(0, 120)}`);

  const vendor = resolveCoverImageVendor();
  const allowFallback = coverFallbackEnabled(vendor);
  const vendorChain = allowFallback
    ? [vendor, ...resolveCoverImageFallbackVendors(vendor)]
    : [vendor];
  log(`Generating text-free ${COVER_ASPECT} cover via ${vendorChain.join(' → ')}...`);

  const imageDeps = {
    aspect: COVER_ASPECT,
    openai,
    fal,
    genAI,
    log,
    title: 'NiSeNews digest cover',
    openRouterFallback: process.env.OPENROUTER_API_KEY
      ? (prompt) => generateImageWithRetry(
        () => generateImage(prompt, {
          vendor: 'openrouter',
          aspect: COVER_ASPECT,
          model: 'google/gemini-3.1-flash-image',
          title: 'NiSeNews digest cover',
          log,
        }),
        { log, label: 'Cover google-fallback' },
      )
      : null,
    openaiFallback: process.env.OPENAI_API_KEY
      ? (prompt) => generateImageWithRetry(
        () => generateImage(prompt, {
          vendor: 'openai',
          aspect: COVER_ASPECT,
          openai,
          model: 'gpt-image-1',
          log,
        }),
        { log, label: 'Cover openai-fallback' },
      )
      : null,
  };

  const filename = digestCoverFilename();
  const filepath = join(OUTPUT_DIR, filename);
  let imageUrl;
  let usedVendor = vendor;
  let lastError;
  let lastReview;

  for (let attempt = 1; attempt <= coverReviewAttempts(); attempt += 1) {
    imageUrl = null;
    lastError = null;
    for (const currentVendor of vendorChain) {
      try {
        imageUrl = await generateCoverImage(cover.prompt, currentVendor, imageDeps, { allowFallback });
        usedVendor = currentVendor;
        if (currentVendor !== vendor) {
          log(`Cover OK via fallback vendor ${currentVendor}`);
        }
        break;
      } catch (err) {
        lastError = err;
        const nextVendor = vendorChain[vendorChain.indexOf(currentVendor) + 1];
        if (nextVendor) {
          log(`Cover ${currentVendor} failed (${err.message}); trying ${nextVendor}...`);
        }
      }
    }
    if (!imageUrl && lastError) throw lastError;
    if (!imageUrl) {
      throw new Error('Cover image generation returned no payload');
    }
    log(`Cover image OK ${safeLogUrl(imageUrl)}`);
    await saveCoverImage(imageUrl, filepath);
    const buffer = imagePayloadToBuffer(imageUrl) || readFileSync(filepath);
    lastReview = await reviewCoverImage({
      buffer,
      visualSubject: cover.visualSubject,
      inspectJson: inspectCoverImage,
      log,
    });
    if (lastReview.ok || lastReview.skipped) break;
    log(`Cover visual review failed (attempt ${attempt}): ${lastReview.reason}`);
  }

  if (lastReview && !lastReview.ok && !lastReview.skipped) {
    throw new Error(`Cover image failed visual review: ${lastReview.reason}`);
  }

  const sidecar = {
    articleIndex: cover.articleIndex,
    coreFact: cover.coreFact,
    entities: cover.entities,
    newsTone: cover.newsTone,
    visualSubject: cover.visualSubject,
    pickReason: cover.pickReason,
    fallback: cover.fallback,
    aspect: COVER_ASPECT,
    vendor: usedVendor,
    visualReview: lastReview?.skipped ? 'skipped' : (lastReview?.ok ? 'passed' : 'rejected'),
  };
  writeFileSync(filepath.replace(/\.png$/i, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);

  const publicUrl = `${SERVER.replace(/\/+$/, '')}/images/${encodeURIComponent(filename)}`;
  await persistCoverUrl(digestId, publicUrl);

  log(`✅ Digest cover saved: ${filepath}`);
  log(`   No text overlay. Facebook caption is the digest itself.`);
  console.log(`Path: ${filepath}`);
  return filepath;
}

main().catch((err) => {
  reportFatal(err);
  process.exit(1);
});
