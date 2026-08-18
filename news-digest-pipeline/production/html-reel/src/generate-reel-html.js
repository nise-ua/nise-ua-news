#!/usr/bin/env node

/**
 * Video Pipeline — HTML-template reel generator (alternative path).
 *
 * Hybrid frames: grounded AI 9:16 scene background + HTML text/brand overlay
 * rendered via Patchright. Pass --no-ai-bg for typography-only CSS backgrounds.
 *
 * Usage:
 *   node production/html-reel/src/generate-reel-html.js latest --images-only
 *   node production/html-reel/src/generate-reel-html.js latest --images-only --no-ai-bg
 *   node production/html-reel/src/generate-reel-html.js <digest-id>
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { basename, join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { initDb, getDb, updateDigest } from '../../../src/db/index.js';

import { generateStoryboard } from '../../video/src/storyboard.js';
import { generateShotClip } from '../../video/src/generate-clips.js';
import { stitchClips, mergeShotVideoAndAudio } from '../../video/src/stitch.js';
import { getDigestContent, parseDigestItemTexts } from '../../lib/digest.js';
import { buildGroundedPrompt, inferNewsToneFromFact } from '../../lib/visual-grounding.js';
import { EDGE_VOICE, completeClause, generatePerArticleAudio } from '../../lib/tts.js';
import { log, projectRoot, scriptDir } from '../../lib/logging.js';
import { renderShotsToPngs } from './render-frame.js';
import { generateAiBackgroundsForShots } from './fetch-ai-backgrounds.js';

const __dirname = scriptDir(import.meta.url);
const ROOT = projectRoot(import.meta.url, 3);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const SERVER = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
// Videos must land where the UI serves them from, i.e. the shared reel output.
const OUTPUT_DIR = join(__dirname, '..', '..', 'video', 'output');
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

// ---------------------------------------------------------------------------
// Digest -> storyboard fallback (self-contained copy of the reel CLI helpers)
// ---------------------------------------------------------------------------

function firstSentence(text) {
  return String(text || '').split(/(?<=[.!?])\s+/)[0].trim();
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

function buildFallbackTitle(text) {
  const sentence = firstSentence(text).replace(/^[-–—:]+|[-–—:]+$/g, '').trim();
  const colon = sentence.search(/\s[:—-]\s/);
  const candidate = colon > 0 ? sentence.slice(0, colon) : sentence;
  return candidate.split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
}

function buildFallbackDetail(text) {
  const source = String(text || '').trim();
  const sentences = source.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length > 1) return sentences.slice(1, 3).join(' ');
  if (sentences.length === 1 && sentences[0]) return sentences[0];
  return completeClause(source, 22, 150);
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
        entities: [],
        newsTone,
        visualSubject: coreFact,
        headline: buildFallbackTitle(factual),
        detailText: buildFallbackDetail(factual),
        spokenText: completeClause(factual, 16, 110),
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
  const noAiBg = args.includes('--no-ai-bg');
  const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'facebook';

  mkdirSync(OUTPUT_DIR, { recursive: true });
  removeStaleTempRuns();
  const runKey = String(digestId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempDir = join(OUTPUT_DIR, `temp_${runKey}_${Date.now()}_${process.pid}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    const digestText = await getDigestContent(digestId, { log });
    log(`Digest: ${digestText.length} chars`);

    let storyboard;
    try {
      storyboard = await generateStoryboard(digestText, format);
      log(`Storyboard created with ${storyboard.shots.length} shots.`);
    } catch (err) {
      log(`Storyboard AI unavailable (${err.message}); using fallback parser.`);
      storyboard = fallbackStoryboard(digestText);
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

    let shotsForRender = storyboard.shots;
    if (!noAiBg) {
      shotsForRender = await generateAiBackgroundsForShots(storyboard.shots, { log });
    } else {
      log('Skipping AI scene backgrounds (--no-ai-bg); typography-only CSS templates.');
    }

    log(`Rendering ${shotsForRender.length} HTML template frames (1080x1920)...`);
    const shotsWithImages = await renderShotsToPngs({
      shots: shotsForRender,
      outputDir: imagesOnly ? OUTPUT_DIR : tempDir,
      prefix: imagesOnly ? `reel-html-image_${timestamp}` : 'frame',
      log,
    });

    // A partial set would shift audio/article indexes, so treat it as a failure.
    if (shotsWithImages.length !== storyboard.shots.length) {
      throw new Error('Not every shot produced an HTML template frame; the reel was stopped.');
    }

    if (imagesOnly) {
      const savedImages = shotsWithImages.map(shot => shot.imageUrl);
      savedImages.forEach((path, i) => {
        log(`  Saved reel background ${i + 1}/${savedImages.length}: ${path}`);
      });
      log(`Generated ${savedImages.length} HTML reel background images; stopped before TTS/video assembly.`);
      return savedImages;
    }

    const audioResults = await generatePerArticleAudio(storyboard.shots, tempDir, { log });

    log('Generating synchronized video clips for shots...');
    const syncedShotPaths = [];
    for (let i = 0; i < shotsWithImages.length; i += 1) {
      const shot = shotsWithImages[i];
      const audio = audioResults[i];
      shot.duration = audio ? audio.duration : 5;
      if (format === 'shorts') shot.duration += 2.25;
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

    const finalReelPath = join(OUTPUT_DIR, `${format === 'shorts' ? 'shorts' : 'reel'}_html_${timestamp}.mp4`);
    stitchClips({
      clipPaths: syncedShotPaths,
      outputPath: finalReelPath,
      backgroundMusic: true,
      musicSeed: Date.now(),
      format,
      firstFrameImage: shotsWithImages[0]?.imageUrl,
      lastFrameImage: shotsWithImages[shotsWithImages.length - 1]?.imageUrl,
    });

    const musicMeta = stitchClips.lastMusicMeta;
    const musicNote = musicMeta ? `${musicMeta.styleLabel} @ ${musicMeta.bpm} BPM` : 'news bed';
    log(`\n🎉 Final Synchronized Video Reel successfully created!    Voice: ${EDGE_VOICE} | images: HTML hybrid 9:16 | music: ${musicNote}`);
    // The digests route reads the last stdout line and maps it to /videos/<file>.
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
