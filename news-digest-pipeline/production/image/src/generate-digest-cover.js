#!/usr/bin/env node

/**
 * Facebook digest cover image.
 *
 * Picks the single most scroll-stopping news block, generates one text-free
 * 4:5 photograph, and writes it for the Facebook feed post. No overlay text.
 *
 * Usage:
 *   node production/image/src/generate-digest-cover.js latest
 *   node production/image/src/generate-digest-cover.js <digest-id>
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import OpenAI from 'openai';
import { fal } from '@fal-ai/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { initDb, getDb, updateDigest } from '../../../src/db/index.js';
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
  resolveImageVendor,
  safeLogUrl,
} from '../../lib/image-backends.js';
import { log, projectRoot, scriptDir } from '../../lib/logging.js';

const __dirname = scriptDir(import.meta.url);
const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

fal.config({ credentials: process.env.FAL_KEY });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init' });
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-init' });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'dummy-key-for-init');

const SERVER = process.env.BASE_URL || process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const OUTPUT_DIR = join(__dirname, '..', 'output');
const DB_PATH = join(ROOT, 'data', 'news-digest.db');

async function completeJson(systemPrompt, userPrompt) {
  const vendor = String(process.env.LLM_VENDOR || '').trim().toLowerCase();
  let text;

  if (vendor === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing in .env');
    const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(process.env.BASE_URL ? { 'HTTP-Referer': process.env.BASE_URL } : {}),
        'X-Title': 'NiSeNews digest cover',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error?.message || `OpenRouter cover request failed (${res.status})`);
    }
    text = payload?.choices?.[0]?.message?.content;
  } else if (process.env.OPENAI_API_KEY) {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });
    text = res.choices[0].message.content;
  } else if (process.env.ANTHROPIC_API_KEY) {
    const res = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }],
    });
    text = res.content[0].text;
  } else if (process.env.GOOGLE_API_KEY) {
    const textModel = (process.env.GOOGLE_MODEL && !process.env.GOOGLE_MODEL.includes('image'))
      ? process.env.GOOGLE_MODEL
      : 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({
      model: textModel,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const res = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    text = res.response.text();
  } else {
    throw new Error('No LLM key found for digest cover selection');
  }

  if (!text) throw new Error('Cover selection response did not contain text');
  return text;
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

async function persistCoverUrl(digestId, publicUrl) {
  let id = digestId !== 'latest' ? digestId : null;
  try {
    initDb(process.env.DB_PATH || DB_PATH);
    if (!id) {
      const row = getDb().prepare('SELECT id FROM digests ORDER BY date DESC LIMIT 1').get();
      if (row) id = row.id;
    }
    if (id) {
      updateDigest(id, { image_url: publicUrl });
      log(`Stored cover URL for digest ${id}: ${publicUrl}`);
    }
  } catch (err) {
    console.error('[update] Failed to store cover URL:', err.message);
  }
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

  const vendor = resolveImageVendor();
  log(`Generating text-free ${COVER_ASPECT} cover via ${vendor}...`);

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
          model: 'google/gemini-2.5-flash-image',
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

  let imageUrl;
  if (vendor === 'openrouter') {
    imageUrl = await generateImageWithRetry(
      () => generateImage(cover.prompt, {
        ...imageDeps,
        vendor: 'openrouter',
        model: process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro',
      }),
      { log, label: 'Cover' },
    );
  } else {
    imageUrl = await generateImage(cover.prompt, { ...imageDeps, vendor });
  }

  if (!imageUrl) {
    throw new Error('Cover image generation returned no payload');
  }
  log(`Cover image OK ${safeLogUrl(imageUrl)}`);

  const filename = digestCoverFilename();
  const filepath = join(OUTPUT_DIR, filename);
  await saveCoverImage(imageUrl, filepath);

  const sidecar = {
    articleIndex: cover.articleIndex,
    coreFact: cover.coreFact,
    entities: cover.entities,
    newsTone: cover.newsTone,
    visualSubject: cover.visualSubject,
    pickReason: cover.pickReason,
    fallback: cover.fallback,
    aspect: COVER_ASPECT,
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
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
