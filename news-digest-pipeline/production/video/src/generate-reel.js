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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import { updateDigest } from '../../../src/db/index.js';
import { createRequire } from 'module';

import { generateStoryboard } from './storyboard.js';
import { generateShotClip } from './generate-clips.js';
import { stitchClips, mergeShotVideoAndAudio } from './stitch.js';
import { groundVisualVariant, buildGroundedPrompt, inferNewsToneFromFact } from '../../lib/visual-grounding.js';
import { prepareTtsText } from '../../lib/tts-pronunciation.js';

import OpenAI from 'openai';
import { fal } from '@fal-ai/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const require = createRequire(import.meta.url);
const ffmpegStaticPkg = require('ffmpeg-static');
const ffprobeStaticPkg = require('ffprobe-static');

// Initialize Google Gemini client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'dummy-key-for-init');

const FFMPEG = ffmpegStaticPkg || 'ffmpeg';
const FFPROBE = ffprobeStaticPkg.path;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const SERVER = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const OUTPUT_DIR = join(__dirname, '..', 'output');
const DB_PATH = join(ROOT, 'data', 'news-digest.db');

const configuredEdgeVoice = process.env.EDGE_TTS_VOICE || '';
const EDGE_VOICE = /^uk-UA-/i.test(configuredEdgeVoice)
  ? configuredEdgeVoice
  : 'uk-UA-PolinaNeural';

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

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function safeLogUrl(url) {
  if (!url) return 'null';
  if (url.startsWith('data:')) {
    return `${url.slice(0, 40)}... [base64 data URI, length: ${url.length}]`;
  }
  return url.length > 80 ? `${url.slice(0, 80)}...` : url;
}

/** Normalize model aliases used by the OpenAI Images API branch. */
function resolveImageModel(configuredModel) {
  let model = String(configuredModel || 'dall-e-3').trim();
  if (model.includes('/')) model = model.split('/').pop();
  if (model === 'gpt-image-1-mini') return 'gpt-image-1';
  return model;
}

/** Generate an image using Google Gemini (gemini-2.5-flash-image). Returns a data URI or URL. */
async function generateGoogleImage(prompt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY missing in .env');

  const modelName = process.env.GOOGLE_MODEL || 'gemini-2.5-flash-image';

  // 1. Google Gemini multimodal image generation endpoint
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] }
      })
    });
    if (res.ok) {
      const data = await res.json();
      for (const candidate of data?.candidates || []) {
        for (const part of candidate?.content?.parts || []) {
          if (part?.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            return `data:${mime};base64,${part.inlineData.data}`;
          }
        }
      }
    } else {
      const errText = await res.text();
      log(`  Google Gemini image generation API returned ${res.status}: ${errText.slice(0, 150)}`);
    }
  } catch (err) {
    log(`  Google Gemini image fetch error: ${err.message}`);
  }

  // 2. Fallback using Google AI SDK generateContent
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const candidates = result?.response?.candidates;
    if (candidates && candidates.length) {
      const part = candidates[0].content?.parts?.[0];
      if (part?.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        return `data:${mime};base64,${part.inlineData.data}`;
      }
      if (part?.blob?.data) {
        return `data:image/png;base64,${part.blob.data}`;
      }
    }
  } catch (err) {
    log(`  Gemini SDK generateContent error: ${err.message}`);
  }

  // 3. Fallback to OpenRouter Google model if OPENROUTER_API_KEY is available
  if (process.env.OPENROUTER_API_KEY) {
    log('  Fallback: generating Google image via OpenRouter...');
    const url = await generateImageWithRetry({ prompt }, 'google/gemini-2.5-flash-image', 0);
    if (url) return url;
  }

  throw new Error('Failed to obtain image from Google Gemini');
}

function imageSizeForModel(model) {
  if (model === 'dall-e-3') return '1024x1792';
  if (model === 'gpt-image-1') return '1024x1792';
  return '1024x1024';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function firstSentence(text) {
  return String(text || '').split(/(?<=[.!?])\s+/)[0].trim();
}

function completeClause(text, maxWords = 20, maxChars = 140) {
  const source = String(text || '').trim();
  const sentences = source.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length > 0) {
    let combined = '';
    for (const s of sentences) {
      const candidate = `${combined} ${s}`.trim();
      if (candidate.split(/\s+/).length <= maxWords || !combined) {
        combined = candidate;
      } else {
        break;
      }
    }
    if (combined) return /[.!?]$/.test(combined) ? combined : `${combined}.`;
  }
  const clauses = source.split(/(?<=[.!?;:])\s+|(?<=,\s)/).map(s => s.trim()).filter(Boolean);
  let result = '';
  for (const clause of clauses) {
    const candidate = `${result} ${clause}`.trim();
    if (candidate.split(/\s+/).length > maxWords || candidate.length > maxChars) break;
    result = candidate;
    if (/[.!?]$/.test(clause)) break;
  }
  if (result) return /[.!?]$/.test(result) ? result : `${result}.`;
  const words = source.split(/\s+/).filter(Boolean).slice(0, maxWords);
  return `${words.join(' ').replace(/[,:;—-]+$/, '')}.`;
}

function buildFallbackTitle(text) {
  const sentence = firstSentence(text).replace(/^[-–—:]+|[-–—:]+$/g, '').trim();
  const lower = text.toLowerCase();
  if (lower.includes('esp32') || lower.includes('мікроконтролер')) return 'Українець запустив LLM на мікроконтролері';
  if (lower.includes('амодеї') || lower.includes('лояль') || lower.includes('місі')) return 'Фахівці більше не тримаються за одну компанію';
  if (lower.includes('математик')) return 'ШІ наближається до рівня професійних математиків';
  if (lower.includes('falcon 9') || lower.includes('місяц')) return 'Стара ракета Falcon 9 вріжеться в Місяць';
  if (lower.includes('hugging face') || lower.includes('кібербезп')) return 'Автономний AI-агент атакував Hugging Face';
  const colon = sentence.search(/\s[:—-]\s/);
  const candidate = colon > 0 ? sentence.slice(0, colon) : sentence;
  return candidate.split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
}

function buildFallbackHook(text) {
  const lower = text.toLowerCase();
  if (lower.includes('esp32') || lower.includes('мікроконтролер')) return 'Український розробник запустив повноцінну LLM на чипі за десять доларів.';
  if (lower.includes('амодеї') || lower.includes('лояль') || lower.includes('місі')) return 'Працівники приходять у компанію за грошима, а не за лояльністю.';
  if (lower.includes('математик')) return 'ШІ вже наближається до рівня професійних математиків.';
  if (lower.includes('falcon 9') || lower.includes('місяц')) return 'Стара ракета Falcon 9 незабаром вріжеться в Місяць.';
  if (lower.includes('hugging face') || lower.includes('кібербезп')) return 'Hugging Face атакував автономний AI-агент без оператора.';
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

function isRetryableImageError(error) {
  const message = String(error?.message || error).toLowerCase();
  return error?.status === 429 || /429|rate limit|too many requests|temporarily unavailable|try again later/.test(message);
}

async function generateOpenRouterImage(prompt, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing in .env');
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(process.env.BASE_URL ? { 'HTTP-Referer': process.env.BASE_URL } : {}),
      'X-Title': 'NiSeNews video pipeline',
    },
    body: JSON.stringify({
      model,
      prompt: `${prompt}\nPortrait 9:16 composition, native vertical image.`,
      n: 1,
      resolution: '2K',
      aspect_ratio: '9:16',
      output_format: 'png',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenRouter image request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const item = payload?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:${item.media_type || 'image/png'};base64,${item.b64_json}`;
  throw new Error('OpenRouter response did not contain an image payload');
}

async function generateImageWithRetry(shot, model, index) {
  const maxRetries = Math.max(0, Number(process.env.IMAGE_MAX_RETRIES || 3));
  const baseDelayMs = Math.max(250, Number(process.env.IMAGE_RETRY_DELAY_MS || 4000));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await generateOpenRouterImage(shot.prompt, model);
    } catch (error) {
      if (!isRetryableImageError(error) || attempt >= maxRetries) throw error;
      const delayMs = baseDelayMs * (2 ** attempt);
      log(`  Image ${index + 1}: rate limited; retry ${attempt + 1}/${maxRetries} in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}

// ---------------------------------------------------------------------------
// Digest loading (DB-first, date-ordered — matches the real image/digest sync)
// ---------------------------------------------------------------------------

async function fetchDigestFromApi(digestId) {
  try {
    const url = digestId === 'latest'
      ? `${SERVER}/api/digests/latest/text`
      : `${SERVER}/api/digests/${digestId}/text`;
    const headers = {};
    if (process.env.API_ACCESS_KEY) headers['X-API-Key'] = process.env.API_ACCESS_KEY;
    log(`Fetching digest from API: ${url}`);
    const res = await fetch(url, { headers });
    if (res.ok) return await res.text();
    log(`API fetch failed with status: ${res.status}`);
  } catch (err) {
    log(`API connection failed: ${err.message}`);
  }
  return null;
}

/**
 * Load the newest digest by DATE from the pipeline SQLite DB.
 * The image carousels are generated from the newest digest; using the same
 * DB lookup guarantees voiceover, pictures and digest stay in sync.
 */
function loadLatestDigestFromDb() {
  if (!existsSync(DB_PATH)) return null;
  try {
    return execFileSync('sqlite3', [
      DB_PATH,
      'SELECT content FROM digests ORDER BY date DESC LIMIT 1;',
    ], { encoding: 'utf8' }).trim() || null;
  } catch (err) {
    log(`Warning: could not query DB: ${err.message}`);
    return null;
  }
}

function loadDigestFromLocalFiles() {
  const outputDir = join(ROOT, 'output');
  if (existsSync(outputDir)) {
    const files = readdirSync(outputDir).filter(f => f.startsWith('digest_') && f.endsWith('.txt'));
    if (files.length > 0) {
      files.sort().reverse();
      log(`Found local digest file: ${files[0]}`);
      return readFileSync(join(outputDir, files[0]), 'utf-8');
    }
  }
  return null;
}

async function getDigestContent(digestId) {
  // 1) For 'latest': prefer the newest digest by date from the pipeline DB —
  //    the same source the Instagram carousels are built from.
  if (digestId === 'latest') {
    const dbContent = loadLatestDigestFromDb();
    if (dbContent) {
      log('Loaded newest digest from pipeline DB (date-ordered).');
      return dbContent;
    }
  }

  // 2) Try the API (works when the server is running).
  const apiContent = await fetchDigestFromApi(digestId);
  if (apiContent) return apiContent;

  // 3) Fallback: local digest files under output/.
  const localContent = loadDigestFromLocalFiles();
  if (localContent) return localContent;

  throw new Error('Could not get digest content from DB, API, or local files.');
}

// ---------------------------------------------------------------------------
// Natural Ukrainian TTS (edge-tts neural voice — free, no API credits)
// ---------------------------------------------------------------------------

function getAudioDuration(audioPath) {
  return Number(execFileSync(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', audioPath,
  ], { encoding: 'utf8' }).trim());
}

/**
 * Generate natural Ukrainian TTS per shot using Microsoft Edge neural voices
 * (uk-UA-PolinaNeural / uk-UA-OstapNeural) via `uvx edge-tts` — free and
 * human-quality.  If ELEVENLABS_API_KEY is configured the pipeline prefers
 * ElevenLabs; otherwise edge-tts is the default (no paid credits needed).
 * Returns [{ audioPath, duration }].
 */
async function generatePerArticleAudio(shots, tempDir) {
  const results = [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const rawText = completeClause(shot.spokenText || shot.headline || '');
    const text = prepareTtsText(rawText);
    const mp3Path = join(tempDir, `audio_shot_${i + 1}.mp3`);
    const tmpPath = join(tempDir, `tts_raw_${i + 1}.mp3`);
    if (text !== rawText) log(`  TTS pronunciation: "${rawText.slice(0, 50)}..." → "${text.slice(0, 50)}..."`);
    log(`  Audio ${i + 1}/${shots.length} (${EDGE_VOICE}): "${text.slice(0, 50)}..."`);

    // Edge neural TTS (natural Ukrainian). Fallback to ElevenLabs if configured.
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_UKRAINIAN_VOICE_ID) {
      const voiceId = process.env.ELEVENLABS_UKRAINIAN_VOICE_ID;
      log(`  Using ElevenLabs TTS (voice ${voiceId})...`);
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (res.ok) {
        writeFileSync(tmpPath, Buffer.from(await res.arrayBuffer()));
      } else {
        log(`ElevenLabs error (${res.status}), falling back to edge-tts...`);
        execFileSync('uvx', [
          'edge-tts',
          `--text=${text}`,
          `--voice=${EDGE_VOICE}`,
          `--write-media=${tmpPath}`,
        ], { stdio: 'pipe' });
      }
    } else {
      // Default: free natural neural Ukrainian voice.
      execFileSync('uvx', [
        'edge-tts',
        `--text=${text}`,
        `--voice=${EDGE_VOICE}`,
        `--write-media=${tmpPath}`,
      ], { stdio: 'pipe' });
    }

    // Normalize to 48 kHz stereo for the reel mix.
    execFileSync(FFMPEG, ['-y', '-i', tmpPath, '-ar', '48000', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '192k', mp3Path], { stdio: 'pipe' });
    results.push({ audioPath: mp3Path, duration: getAudioDuration(mp3Path) });
  }
  return results;
}

async function generateBackgroundImagesForShots(shots) {
  const vendor = process.env.IMAGE_VENDOR || (process.env.OPENAI_API_KEY ? 'dalle' : 'fal');
  log(`Generating ${shots.length} native 9:16 background images via ${vendor}...`);
  const failures = [];

  const results = [];
  const requestDelayMs = Math.max(0, Number(process.env.IMAGE_REQUEST_DELAY_MS || 1500));
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
        imageUrl = await generateImageWithRetry({ ...shot, prompt: imagePrompt }, process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro', i);
      } else if (vendor === 'dalle' || vendor === 'openai') {
        if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing in .env');
        const model = resolveImageModel(process.env.DALLE_MODEL);
        const size = imageSizeForModel(model);
        const response = await openai.images.generate({
          model,
          prompt: imagePrompt,
          n: 1,
          size,
          quality: ["dall-e-3","gpt-image-3"].includes(model) ? 'standard' : undefined,
        });
        const item = response?.data?.[0];
        if (item?.url) imageUrl = item.url;
        else if (item?.b64_json) imageUrl = `data:image/png;base64,${item.b64_json}`;
        if (!imageUrl) throw new Error('Invalid response structure from OpenAI');
        log(`  OpenAI response: ${safeLogUrl(imageUrl)}`);
      } else if (vendor === 'google') {
        // Use Google Gemini for image generation
        imageUrl = await generateGoogleImage(imagePrompt);
        if (!imageUrl) throw new Error('Google Gemini image generation failed');
        log(`  Google Gemini response: ${safeLogUrl(imageUrl)}`);
      } else {
        if (!process.env.FAL_KEY) throw new Error('FAL_KEY missing in .env');
        const result = await fal.subscribe('fal-ai/flux/dev', {
          input: {
            prompt: imagePrompt,
            image_size: { width: 1080, height: 1920 },
            num_inference_steps: 28,
            guidance_scale: 3.5,
          },
        });
        imageUrl = result.data.images[0].url;
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

function parseDigestItems(digestText) {
  const items = [];
  const clean = digestText.replace(/\n🤖[\s\S]*$/g, '');
  const regex = /(\d+)\.\s+([\s\S]*?)(?=\n\d+\.\s|\n🤖|$)/g;
  let match;
  while ((match = regex.exec(clean)) !== null) {
    let body = match[2].trim();
    body = body.replace(/https?:\/\/\S+/g, '').trim();
    if (body.length > 40) items.push(body);
  }
  return items;
}

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
  const items = parseDigestItems(digestText);
  log(`Fallback storyboard: parsing ${items.length} digest items into shots.`);
  return {
    shots: items.map((item, i) => {
      const factual = stripSarcasticLeadIn(item) || item;
      const coreFact = firstSentence(factual);
      const newsTone = inferNewsToneFromFact(coreFact);
      return {
        shot: i + 1,
        coreFact,
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

  mkdirSync(OUTPUT_DIR, { recursive: true });
  removeStaleTempRuns();
  const runKey = String(digestId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempDir = join(OUTPUT_DIR, `temp_${runKey}_${Date.now()}_${process.pid}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    // Step 1: Digest content (DB-by-date for 'latest', API, or local files)
    const digestText = await getDigestContent(digestId);
    log(`Digest: ${digestText.length} chars`);

    // Step 2: Storyboard (AI if keys available, else parse digest items)
    let storyboard;
    try {
      storyboard = await generateStoryboard(digestText);
      log(`Storyboard created with ${storyboard.shots.length} shots.`);
    } catch (err) {
      log(`Storyboard AI unavailable (${err.message}); using fallback parser.`);
      storyboard = fallbackStoryboard(digestText);
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
    const audioResults = await generatePerArticleAudio(storyboard.shots, tempDir);

    // Step 5: Generate synchronized clips.
    log('Generating synchronized video clips for shots...');
    const syncedShotPaths = [];
    for (let i = 0; i < shotsWithImages.length; i++) {
      const shot = shotsWithImages[i];
      const audio = audioResults[i];
      shot.duration = audio ? audio.duration : 5;
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
    const finalReelPath = join(OUTPUT_DIR, `reel_${timestamp}.mp4`);

    stitchClips({
      clipPaths: syncedShotPaths,
      outputPath: finalReelPath,
      backgroundMusic: true,
      musicSeed: Date.now(),
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

    // Store public Reel URL in DB for later publishing
    const publicUrl = `${SERVER}/reels/${require('path').basename(finalReelPath)}`;
    // Determine which digest to update: if a specific ID was provided, use it; otherwise update the latest digest.
    let digestToUpdateId = digestId !== 'latest' ? digestId : null;
    if (!digestToUpdateId) {
      // Fetch latest digest ID from DB (ordered by date DESC)
      const db = require('../../../src/db/index.js').getDb();
      const row = db.prepare('SELECT id FROM digests ORDER BY date DESC LIMIT 1;').get();
      if (row) digestToUpdateId = row.id;
    }
    if (digestToUpdateId) {
      try {
        const { updateDigest } = require('../../db/index.js');
        updateDigest(digestToUpdateId, { reel_url: publicUrl });
        console.log(`[update] Reel URL stored for digest ${digestToUpdateId}: ${publicUrl}`);
      } catch (e) {
        console.error('[update] Failed to store Reel URL:', e.message);
      }
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