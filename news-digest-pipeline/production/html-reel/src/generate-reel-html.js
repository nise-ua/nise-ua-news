#!/usr/bin/env node

/**
 * Video Pipeline — HTML-template reel generator (alternative path).
 *
 * Hybrid frames: grounded AI 9:16 scene background + HTML text/brand overlay
 * rendered via Patchright. Pass --no-ai-bg for typography-only CSS backgrounds.
 *
 * Usage:
 *   node production/html-reel/src/generate-reel-html.js latest --copy-only
 *   node production/html-reel/src/generate-reel-html.js latest --images-only
 *   node production/html-reel/src/generate-reel-html.js latest --images-only --no-ai-bg
 *   node production/html-reel/src/generate-reel-html.js <digest-id>
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { basename, join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { initDb, getDb, updateDigest } from '../../../src/db/index.js';
import { digestVideoUpdateFields } from '../../../src/db/digest-video-fields.js';

import { generateStoryboard } from '../../video/src/storyboard.js';
import { planShortsRuntime } from '../../video/src/shorts-runtime.js';
import { ensureUkrainianOnScreenCopy, assertFinishedReelCopy } from '../../lib/reel-ukrainian-copy.js';
import {
  ReelCopyReviewError,
  alignSpokenToHeadline,
  findLatestStoryboardFile,
  formatCopyReviewTable,
  readStoryboardFile,
  repairShotCopy,
  reviewReelStoryboard,
  stripSarcasticLeadIn,
  writeStoryboardFile,
} from '../../lib/reel-copy-review.js';
import { generateShotClip } from '../../video/src/generate-clips.js';
import { stitchClips, mergeShotVideoAndAudio } from '../../video/src/stitch.js';
import { getDigestContent, parseDigestItemTexts } from '../../lib/digest.js';
import { buildGroundedPrompt, inferNewsToneFromFact } from '../../lib/visual-grounding.js';
import { EDGE_VOICE, generatePerArticleAudio } from '../../lib/tts.js';
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

function fallbackStoryboard(digestText) {
  const items = parseDigestItemTexts(digestText);
  log(`Fallback storyboard: parsing ${items.length} digest items into shots.`);
  return {
    shots: items.map((item, i) => {
      const factual = stripSarcasticLeadIn(item) || item;
      const coreFact = firstSentence(factual);
      const newsTone = inferNewsToneFromFact(coreFact);
      const copy = repairShotCopy({
        shot: i + 1,
        coreFact,
        sourceText: factual,
        headline: coreFact,
        detailText: '',
        spokenText: coreFact,
      });
      return {
        ...copy,
        shot: i + 1,
        coreFact,
        sourceText: factual,
        entities: [],
        newsTone,
        visualSubject: coreFact,
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
  const copyOnly = args.includes('--copy-only');
  const storyboardFlag = args.includes('--storyboard') ? args[args.indexOf('--storyboard') + 1] : null;
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

    async function createReviewedStoryboard() {
      try {
        const created = await generateStoryboard(digestText, format);
        log(`Storyboard created with ${created.shots.length} shots.`);
        return created;
      } catch (err) {
        if (err?.name === 'ReelCopyReviewError' || err instanceof ReelCopyReviewError) throw err;
        log(`Storyboard AI unavailable (${err.message}); using fallback parser.`);
        return reviewReelStoryboard(fallbackStoryboard(digestText), { log });
      }
    }

    let storyboard;
    let reusePath = null;
    if (!copyOnly) {
      if (storyboardFlag && storyboardFlag !== 'latest') {
        if (!existsSync(storyboardFlag)) {
          throw new Error(`Storyboard file not found: ${storyboardFlag}`);
        }
        reusePath = storyboardFlag;
      } else {
        reusePath = findLatestStoryboardFile(OUTPUT_DIR, digestId);
      }
    }
    if (reusePath && existsSync(reusePath)) {
      log(`Reusing copy-reviewed storyboard: ${reusePath}`);
      storyboard = readStoryboardFile(reusePath);
      storyboard.shots = (storyboard.shots || []).map((shot) => (
        assertFinishedReelCopy(ensureUkrainianOnScreenCopy(alignSpokenToHeadline(shot)))
      ));
    } else {
      storyboard = await createReviewedStoryboard();
    }

    if (copyOnly) {
      const saved = writeStoryboardFile(OUTPUT_DIR, digestId, storyboard);
      log(`\n${formatCopyReviewTable(storyboard)}`);
      log(`Wrote copy-reviewed storyboard: ${saved}`);
      log('Final copy is ready for review. Approve it, then run --images-only.');
      return saved;
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
    const baseDurations = shotsWithImages.map((_, i) => audioResults[i]?.duration || 5);
    const shortsPlan = format === 'shorts' ? planShortsRuntime(baseDurations) : { padSec: 0, introOutroSec: 0 };
    if (format === 'shorts') {
      log(`Shorts pacing: pad ${shortsPlan.padSec.toFixed(2)}s, intro/outro ${shortsPlan.introOutroSec}s, ~${shortsPlan.projectedSec.toFixed(1)}s`);
    }
    const syncedShotPaths = [];
    for (let i = 0; i < shotsWithImages.length; i += 1) {
      const shot = shotsWithImages[i];
      const audio = audioResults[i];
      shot.duration = baseDurations[i] + (format === 'shorts' ? shortsPlan.padSec : 0);
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
      introOutroSec: shortsPlan.introOutroSec,
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
        updateDigest(digestToUpdateId, digestVideoUpdateFields(format, {
          videoUrl: publicVideoUrl,
          reelUrl: publicReelUrl,
        }));
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
