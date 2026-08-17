#!/usr/bin/env node

/**
 * Video Pipeline — Main Entry Point for Reel Generation (production / UI button)
 *
 * Full Synchronized Workflow (production, UI-triggered):
 * 1. Digest -> Storyboard (Anthropic/OpenAI when keys available; otherwise
 *    digest items parsed directly into shots with headline === spokenText).
 * 2. Generate a complete set of text-free 9:16 AI Background Images per shot
 *    (OpenRouter/OpenAI/fal). If any image is missing, stop before TTS/video
 *    generation; never reuse an older digest or create synthetic placeholders.
 * 3. Generate NATURAL Ukrainian TTS per shot (edge-tts uk-UA-PolinaNeural via
 *    uvx — free, neural, human-quality; ElevenLabs used automatically when
 *    ELEVENLABS_API_KEY is present).
 * 4. Generate Motion Clips matching the exact TTS duration & background image
 *    (frames full-bleed 9:16; headline overlay inside the FB/IG safe zone —
 *    only for text-free AI backgrounds).
 * 5. Pair each clip with its voiceover -> 100% video-audio sync.
 * 6. Stitch into final Reel MP4 (1080x1920 9:16) WITH the energetic
 *    background-music bed (see generator script for the music synthesis).
 *
 * Usage:
 *   node production/video/src/generate-reel.js latest
 *   node production/video/src/generate-reel.js <digest-id>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from 'fs';
import { join, basename } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { initDb, getDb, updateDigest } from '../../../src/db/index.js';

import { generateStoryboard, refineStoryboardHeadlines } from './storyboard.js';
import { generateShotClip } from './generate-clips.js';
import { stitchClips, mergeShotVideoAndAudio } from './stitch.js';
import { musicSeedFor } from './background-music.js';
import { groundVisualVariant, buildGroundedPrompt, inferNewsToneFromFact } from '../../lib/visual-grounding.js';
import { normalizeHeadline } from '../../lib/reel-ukrainian-copy.js';
import { getDigestContent, parseDigestItemTexts } from '../../lib/digest.js';
import {
  generateImage,
  generateImageWithRetry,
  resolveImageVendor,
  safeLogUrl,
  sleep,
} from '../../lib/image-backends.js';
import {
  EDGE_VOICE,
  completeClause,
  generatePerArticleAudio,
} from '../../lib/tts.js';
import { log, projectRoot, scriptDir } from '../../lib/logging.js';

import OpenAI from 'openai';
import { fal } from '@fal-ai/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = scriptDir(import.meta.url);
const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

// Initialize Google Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'dummy-key-for-init');

const SERVER = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const OUTPUT_DIR = join(__dirname, '..', 'output');
const DB_PATH = join(ROOT, 'data', 'news-digest.db');

function removeStaleTempRuns(maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!existsSync(OUTPUT_DIR)) return;
  for (const name of readdirSync(OUTPUT_DIR)) {
    if (!name.startsWith('temp_')) continue;
    const path = join(OUTPUT_DIR, name);
    try {
      const stats = statSync(path);
      if (stats.isDirectory() && Date.now() - stats.mtimeMs > maxAgeMs) {
        rmSync(path, { recursive: true, force: true });
        log(`Removed stale temporary run: ${name}`);
      }
    } catch (err) {
      log(`Warning: could not remove stale run ${name}: ${err.message}`);
    }
  }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init' });
if (process.env.FAL_KEY) fal.config({ credentials: process.env.FAL_KEY });

function firstSentence(text) {
  return String(text || '').split(/(?<=[.!?])\s+/)[0].trim();
}

function buildFallbackTitle(text) {
  const sentence = firstSentence(text).replace(/^[-–—:]+|[-–—:]+$/g, '').trim();
  const colon = sentence.search(/\s[:—-]\s/);
  const candidate = colon > 0 ? sentence.slice(0, colon) : sentence;
  if (candidate && candidate.length <= 55) {
    return normalizeHeadline(candidate);
  }
  const words = candidate.split(/\s+/).filter(Boolean);
  let title = '';
  for (const word of words) {
    const next = title ? `${title} ${word}` : word;
    if (next.length > 55) break;
    title = next;
  }
  return normalizeHeadline(title) || normalizeHeadline(words[0]) || 'Новини';
}

function buildFallbackHook(text) {
  return completeClause(text, 16, 110);
}

function buildFallbackDetail(text) {
  const source = String(text || '').trim();
  const sentences = source.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length > 1) {
    return sentences.slice(1, 3).join(' ');
  }
  if (sentences.length === 1 && sentences[0]) {
    return sentences[0];
  }
  return completeClause(source, 22, 150);
}

async function generateBackgroundImagesForShots(shots) {
  const vendor = resolveImageVendor();
  log(`Generating ${shots.length} native 9:16 background images via ${vendor}...`);
  const failures = [];

  const results = [];
  const requestDelayMs = Math.max(0, Number(process.env.IMAGE_REQUEST_DELAY_MS || 1500));
  const imageDeps = {
    aspect: '9:16',
    openai,
    fal,
    genAI,
    log,
    title: 'NiSeNews video pipeline',
    openRouterFallback: process.env.OPENROUTER_API_KEY
      ? (prompt) => generateImageWithRetry(
        () => generateImage(prompt, {
          vendor: 'openrouter',
          aspect: '9:16',
          model: 'google/gemini-2.5-flash-image',
          title: 'NiSeNews video pipeline',
          log,
        }),
        { log, label: `Image google-fallback` },
      )
      : null,
  };

  for (let i = 0; i < shots.length; i += 1) {
    // Ground at the final image boundary as well as in storyboard generation.
    // This protects the reel path when a fallback storyboard or another caller
    // supplies a prompt that contains author sarcasm or an abstract metaphor.
    const shot = groundVisualVariant(shots[i], i);
    const imagePrompt = shot.prompt;
    log(`  Image ${i + 1}: "${(imagePrompt || '').slice(0, 60)}..."`);
    try {
      let imageUrl;
      if (vendor === 'openrouter') {
        imageUrl = await generateImageWithRetry(
          () => generateImage(imagePrompt, {
            ...imageDeps,
            vendor: 'openrouter',
            model: process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro',
          }),
          { log, label: `Image ${i + 1}` },
        );
      } else {
        imageUrl = await generateImage(imagePrompt, { ...imageDeps, vendor });
      }
      results.push({ ...shot, imageUrl });
      log(`  Image ${i + 1}: OK ${safeLogUrl(imageUrl)}`);
    } catch (err) {
      log(`  Image ${i + 1}: ERROR ${err.message}`);
      failures.push(`shot ${i + 1}: ${err.message}`);
      results.push({ ...shot, imageUrl: null });
    }
    if (vendor === 'openrouter' && i < shots.length - 1 && requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }
  }

  const ok = results.filter(r => r.imageUrl);
  log(`${ok.length}/${shots.length} background images generated.`);
  if (failures.length > 0) {
    log(`Image provider failures: ${failures.slice(0, 3).join(' | ')}${failures.length > 3 ? ' | ...' : ''}`);
  }
  // A partial set is unsafe: it would shift audio/article indexes and produce
  // a reel that does not represent the selected digest completely.
  return ok.length === shots.length ? ok : [];
}

async function saveGeneratedImage(imageUrl, filepath) {
  if (String(imageUrl).startsWith('data:')) {
    const encoded = String(imageUrl).split(',')[1] || '';
    writeFileSync(filepath, Buffer.from(encoded, 'base64'));
    return;
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download generated image (${response.status})`);
  writeFileSync(filepath, Buffer.from(await response.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// Digest -> storyboard (AI when available, otherwise direct item parsing)
// ---------------------------------------------------------------------------

function stripSarcasticLeadIn(text) {
  return String(text || '')
    .replace(/^\s*ну що,?\s*/i, '')
    .replace(/^\s*знову\s*[«"']?революція[»"']?\s*\??\s*/i, '')
    .replace(/^\s*оце так історія\.?\s*/i, '')
    .replace(/^\s*інтересненько[^.!?]*[.!?]\s*/i, '')
    .replace(/^\s*ага,?\s*/i, '')
    .trim();
}

function fallbackStoryboard(digestText) {
  const items = parseDigestItemTexts(digestText);
  log(`Fallback storyboard: parsing ${items.length} digest items into shots.`);
  return {
    shots: items.map((item, i) => {
      const factual = stripSarcasticLeadIn(item) || item;
      const coreFact = firstSentence(factual);
      const newsTone = inferNewsToneFromFact(coreFact);
      return {
        shot: i + 1,
        coreFact,
        sourceText: factual,
        entities: [],
        newsTone,
        visualSubject: coreFact,
        headline: buildFallbackTitle(factual),
        detailText: buildFallbackDetail(factual),
        spokenText: buildFallbackHook(factual),
        textPosition: 'upper',
        prompt: buildGroundedPrompt({
          visualSubject: coreFact,
          coreFact,
          entities: [],
          newsTone,
          index: i,
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const digestId = args.find(a => !a.startsWith('--')) || 'latest';
  const imagesOnly = args.includes('--images-only');
  const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'facebook';

  mkdirSync(OUTPUT_DIR, { recursive: true });
  removeStaleTempRuns();
  const runKey = String(digestId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempDir = join(OUTPUT_DIR, `temp_${runKey}_${Date.now()}_${process.pid}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Step 1: Digest content (DB-by-date for 'latest', API, or local files)
    const digestText = await getDigestContent(digestId, { log });
    log(`Digest: ${digestText.length} chars`);

    // Step 2: Storyboard (AI if keys available, else parse digest items)
    let storyboard;
    try {
      storyboard = await generateStoryboard(digestText, format);
      log(`Storyboard created with ${storyboard.shots.length} shots.`);
    } catch (err) {
      log(`Storyboard AI unavailable (${err.message}); using fallback parser.`);
      storyboard = fallbackStoryboard(digestText);
    }
    try {
      storyboard = await refineStoryboardHeadlines(storyboard, format);
      log(`Headlines refined by AI for ${storyboard.shots.length} shots.`);
    } catch (err) {
      log(`Headline refinement skipped (${err.message}); keeping original headlines.`);
    }

    // Step 3: Background images. Never use a shared/older carousel fallback:
    // this reel must contain images generated for the selected digest.
    let shotsWithImages;
    try {
      shotsWithImages = await generateBackgroundImagesForShots(storyboard.shots);
    } catch (err) {
      log(`Background AI unavailable (${err.message}); no fallback images will be used.`);
      shotsWithImages = [];
    }

    if (!shotsWithImages || shotsWithImages.length === 0) {
      throw new Error('No fresh background images were generated for this digest. The reel was stopped; no older or synthetic fallback images are allowed. Check the configured image-provider key/quota and try again.');
    } else {
      // AI backgrounds are text-free -> overlay the safe-zone headline.
      shotsWithImages.forEach(s => { s.overlay = true; });
    }

    if (imagesOnly) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const savedImages = [];
      for (let i = 0; i < shotsWithImages.length; i += 1) {
        const filepath = join(OUTPUT_DIR, `reel-image_${timestamp}_${String(i + 1).padStart(2, '0')}.png`);
        await saveGeneratedImage(shotsWithImages[i].imageUrl, filepath);
        savedImages.push(filepath);
        log(`  Saved reel background ${i + 1}/${shotsWithImages.length}: ${filepath}`);
      }
      log(`Generated ${savedImages.length} reel background images; stopped before TTS/video assembly.`);
      return savedImages;
    }

    // Step 4: Generate natural Ukrainian TTS, one clip per shot, timed exactly.
    const audioResults = await generatePerArticleAudio(storyboard.shots, tempDir, { log });

    // Step 5: Generate synchronized clips.
    log('Generating synchronized video clips for shots...');
    const syncedShotPaths = [];
    for (let i = 0; i < shotsWithImages.length; i++) {
      const shot = shotsWithImages[i];
      const audio = audioResults[i];
      shot.duration = audio ? audio.duration : 5;
      if (format === 'shorts') {
        // Add 1.5-3s music-only interstitial
        shot.duration += 2.25; // Average of 1.5 and 3
      }
      log(`  Shot ${i + 1}: ${shot.duration.toFixed(2)}s — "${(shot.headline || '').slice(0, 50)}..."`);

      const silentVideoPath = await generateShotClip(shot, tempDir);
      const syncedShotPath = join(tempDir, `shot_synced_${i + 1}.mp4`);
      if (audio?.audioPath && existsSync(audio.audioPath)) {
        mergeShotVideoAndAudio(silentVideoPath, audio.audioPath, syncedShotPath);
        syncedShotPaths.push(syncedShotPath);
      } else {
        syncedShotPaths.push(silentVideoPath);
      }
    }

    // Step 6: Stitch synchronized shots into final Reel MP4 WITH a fresh
    // energetic news-bed (synthesized per run — similar TV-news style, new seed).
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const finalReelPath = join(OUTPUT_DIR, `${format === 'shorts' ? 'shorts' : 'reel'}_${timestamp}.mp4`);

    stitchClips({
      clipPaths: syncedShotPaths,
      outputPath: finalReelPath,
      backgroundMusic: true,
      musicSeed: musicSeedFor(digestId),
      format,
      firstFrameImage: shotsWithImages[0]?.imageUrl,
      lastFrameImage: shotsWithImages[shotsWithImages.length - 1]?.imageUrl,
    });

    const musicMeta = stitchClips.lastMusicMeta;
    const musicNote = musicMeta
      ? `${musicMeta.styleLabel} @ ${musicMeta.bpm} BPM`
      : 'news bed';
    log(`\n🎉 Final Synchronized Video Reel successfully created!    Voice: ${EDGE_VOICE} | images: AI 9:16 | music: ${musicNote}`);
    // IMPORTANT: the last stdout line must be the absolute path to the reel —
    // the digests route (POST /:id/generate-video) reads the final line and
    // maps it to /videos/<filename>.
    console.log(`Path: ${finalReelPath}`);

    const fileName = basename(finalReelPath);
    const publicReelUrl = `${SERVER}/reels/${fileName}`;
    const publicVideoUrl = `${SERVER}/videos/${fileName}`;
    let digestToUpdateId = digestId !== 'latest' ? digestId : null;
    try {
      initDb(process.env.DB_PATH || DB_PATH);
      if (!digestToUpdateId) {
        const row = getDb().prepare('SELECT id FROM digests ORDER BY date DESC LIMIT 1').get();
        if (row) digestToUpdateId = row.id;
      }
      if (digestToUpdateId) {
        const updateData = {};
        if (format === 'shorts') {
          updateData.youtube_shorts_url = publicVideoUrl;
        } else {
          updateData.video_url = publicVideoUrl;
          updateData.reel_url = publicReelUrl;
        }
        updateDigest(digestToUpdateId, updateData);
        console.log(`[update] Video URL stored for digest ${digestToUpdateId}: ${publicVideoUrl}`);
      }
    } catch (e) {
      console.error('[update] Failed to store video URL:', e.message);
    }

    return finalReelPath;
  } finally {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});