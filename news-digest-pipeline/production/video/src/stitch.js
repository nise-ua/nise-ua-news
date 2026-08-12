#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ffmpegStatic from 'ffmpeg-static';
import { generateBackgroundMusic, reelMusicPathFor } from './background-music.js';

const FFMPEG = ffmpegStatic || 'ffmpeg';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Locate a real, usable background-music asset.
 *
 * Priority:
 *   1. BACKGROUND_MUSIC_PATH env var (absolute path, if set and usable).
 *   2. Preferred filenames inside assets/ (background-music.mp3/.wav/.m4a).
 *   3. The first usable audio file found in assets/.
 *
 * Every candidate must pass isUsableMusic(), which rejects near-silent
 * "tracks" (pure floor noise) so that hiss can never be amplified into a
 * reel as if it were music.
 */
function findStaticBackgroundMusic() {
  if (process.env.BACKGROUND_MUSIC_PATH) {
    const envPath = process.env.BACKGROUND_MUSIC_PATH;
    if (existsSync(envPath) && isUsableMusic(envPath)) return envPath;
  }

  if (!existsSync(ASSETS_DIR)) return null;

  const preferred = ['background-music.mp3', 'background-music.wav', 'background-music.m4a'];
  for (const filename of preferred) {
    const candidate = join(ASSETS_DIR, filename);
    if (existsSync(candidate) && isUsableMusic(candidate)) return candidate;
  }

  const fallback = readdirSync(ASSETS_DIR)
    .filter(filename => /\.(mp3|wav|m4a)$/i.test(filename))
    .sort()
    .map(filename => join(ASSETS_DIR, filename))
    .find(isUsableMusic);
  return fallback || null;
}

/**
 * Fresh news-bed synthesis for each reel (distinct style + key/tempo).
 * Falls back to the checked-in asset when synthesis fails.
 */
function resolveBackgroundMusic({ workDir, reelPath, seed }) {
  if (process.env.BACKGROUND_MUSIC_PATH) {
    const envPath = process.env.BACKGROUND_MUSIC_PATH;
    if (existsSync(envPath) && isUsableMusic(envPath)) {
      log(`Using BACKGROUND_MUSIC_PATH override: ${envPath}`);
      return { path: envPath, fresh: false };
    }
  }

  const resolvedSeed = seed != null ? Number(seed) : Date.now();
  const outputPath = reelPath
    ? reelMusicPathFor(reelPath)
    : join(workDir, `background-music-${resolvedSeed}.mp3`);

  try {
    const { config } = generateBackgroundMusic({ seed: resolvedSeed, outputPath });
    if (isUsableMusic(outputPath)) {
      log(`Generated fresh background music: ${config.styleLabel} @ ${config.bpm} BPM (seed ${config.seed})`);
      log(`  Saved bed: ${outputPath}`);
      return { path: outputPath, fresh: true, config };
    }
    log(`Fresh background music failed validation: ${outputPath}`);
  } catch (err) {
    log(`Fresh background music generation failed: ${err.message}`);
  }

  const staticPath = findStaticBackgroundMusic();
  if (staticPath) {
    log(`⚠️  Falling back to static background music: ${staticPath}`);
    return { path: staticPath, fresh: false };
  }
  return { path: null, fresh: false };
}

// Reject audio assets that are effectively low-level noise (e.g. an old
// checked-in background-music.mp3 with max level around -38 dB). Applying
// loudnorm to such a file amplifies the hiss and produces the constant
// background noise users hear in the final reel.
function isUsableMusic(filePath) {
  try {
    const probe = execSync(
      `"${FFMPEG}" -hide_banner -i "${filePath}" -af volumedetect -f null - 2>&1`,
      { encoding: 'utf8' }
    );
    const match = probe.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
    const maxVolume = match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
    if (maxVolume < -30) {
      log(`Ignoring unusable background track ${filePath} (max volume ${maxVolume} dB).`);
      return false;
    }
    return true;
  } catch (err) {
    log(`Ignoring unreadable background track ${filePath}: ${err.message}`);
    return false;
  }
}

/**
 * Shared filter graph for mixing background music with a voiceover.
 *
 * - Both inputs are resampled to 48 kHz stereo.
 * - The music is attenuated by `musicPostVolume` so the voiceover stays
 *   dominant. NOTE: loudnorm is NOT applied to the music branch — running
 *   loudnorm on an infinitely looped (-stream_loop -1) stream only emits a
 *   tiny buffer (~0.1s), truncating the whole mix. Assets are pre-validated
 *   by isUsableMusic() (rejects near-silent noise), so a plain volume gain
 *   is sufficient and safe.
 * - amix uses `normalize=0` so volumes are not scaled down by input count.
 * - A final limiter prevents clipping.
 */
function buildMusicMixFilter(musicPostVolume) {
  const postVol = musicPostVolume != null ? musicPostVolume : 0.8;
  return (
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.0[voice];` +
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,` +
    `volume=${postVol}[music];` +
    `[voice][music]amix=inputs=2:duration=first:dropout_transition=3:normalize=0,` +
    `alimiter=limit=0.95[aout]`
  );
}

export function mergeShotVideoAndAudio(videoPath, audioPath, outputPath) {
  // Explicitly map the second input: generated clips contain a silent track,
  // so relying on FFmpeg's default stream selection would keep the silence.
  const cmd = `"${FFMPEG}" -y -i "${videoPath}" -i "${audioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest "${outputPath}"`;
  execSync(cmd, { stdio: 'pipe' });
  return outputPath;
}

export function mixVoiceoverWithMusic(voiceoverPath, outputPath, musicVolume = 0.8) {
  const { path: musicPath } = resolveBackgroundMusic({ workDir: dirname(outputPath) });
  if (!musicPath) {
    execSync(`"${FFMPEG}" -y -i "${voiceoverPath}" -c:a aac -b:a 192k -ar 48000 -ac 2 "${outputPath}"`, { stdio: 'pipe' });
    return outputPath;
  }
  const filter = buildMusicMixFilter(musicVolume);
  const cmd = `"${FFMPEG}" -y -i "${voiceoverPath}" -stream_loop -1 -i "${musicPath}" -filter_complex "${filter}" -map "[aout]" -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest "${outputPath}"`;
  execSync(cmd, { stdio: 'pipe' });
  return outputPath;
}

export function stitchClips({ clipPaths, audioPath, outputPath, backgroundMusic = true, musicSeed }) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const concatListPath = join(dirname(outputPath), `concat_list_${Date.now()}.txt`);
  writeFileSync(concatListPath, clipPaths.map(p => `file '${p}'`).join('\n'));

  let musicMeta = null;
  try {
    const musicSelection = backgroundMusic
      ? resolveBackgroundMusic({ workDir: dirname(outputPath), reelPath: outputPath, seed: musicSeed })
      : { path: null, fresh: false };
    const musicPath = musicSelection.path;
    if (musicSelection.config) musicMeta = musicSelection.config;
    // Default post-mix music level is 0.35: keeps the voiceover dominant while
    // the music bed is still clearly audible underneath.
    // Use BACKGROUND_MUSIC_VOLUME env var to tune.
    const musicVolume = process.env.BACKGROUND_MUSIC_VOLUME != null
      ? Number(process.env.BACKGROUND_MUSIC_VOLUME)
      : 0.35;
    let cmd;

    if (audioPath && existsSync(audioPath)) {
      // External audio track (not typical for the per-shot TTS pipeline).
      cmd = `"${FFMPEG}" -y -f concat -safe 0 -i "${concatListPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest -movflags +faststart "${outputPath}"`;
    } else if (musicPath) {
      // TTS is embedded in each clip; mix the (pre-validated) music against it.
      log(`Mixing background music from ${musicPath} (post volume ${musicVolume})`);
      const filter = buildMusicMixFilter(musicVolume);
      cmd = `"${FFMPEG}" -y -f concat -safe 0 -i "${concatListPath}" -stream_loop -1 -i "${musicPath}" -filter_complex "${filter}" -map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest -movflags +faststart "${outputPath}"`;
    } else {
      cmd = `"${FFMPEG}" -y -f concat -safe 0 -i "${concatListPath}" -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart "${outputPath}"`;
    }

    execSync(cmd, { stdio: 'inherit' });
  } finally {
    if (existsSync(concatListPath)) unlinkSync(concatListPath);
  }
  if (musicMeta) {
    stitchClips.lastMusicMeta = musicMeta;
  }
  return outputPath;
}