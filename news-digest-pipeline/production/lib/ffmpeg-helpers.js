/**
 * Shared FFmpeg / ffprobe helpers for reel stitch and audio overlay.
 * Injectable deps so unit tests never spawn real ffmpeg.
 */

import { dirname } from 'path';
import { execFileSync as defaultExecFileSync } from 'child_process';
import { existsSync as defaultExistsSync, mkdirSync as defaultMkdirSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export function defaultFfmpegPath() {
  try {
    return require('ffmpeg-static') || 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
}

export function defaultFfprobePath() {
  try {
    return require('ffprobe-static').path;
  } catch {
    return 'ffprobe';
  }
}

/**
 * Probe duration (seconds) for any media file via ffprobe.
 */
export function getMediaDuration(mediaPath, {
  execFileSync = defaultExecFileSync,
  ffprobePath = defaultFfprobePath(),
} = {}) {
  return Number(execFileSync(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', mediaPath,
  ], { encoding: 'utf8' }).trim());
}

/** @deprecated Prefer getMediaDuration; kept for TTS / stitch call sites. */
export function getAudioDuration(audioPath, deps) {
  return getMediaDuration(audioPath, deps);
}

/** @deprecated Prefer getMediaDuration; kept for stitch call sites. */
export function getVideoDuration(videoPath, deps) {
  return getMediaDuration(videoPath, deps);
}

/**
 * Shared filter graph for mixing background music with a voiceover.
 *
 * - Both inputs are resampled to 48 kHz stereo.
 * - The music is attenuated by `musicPostVolume` so the voiceover stays
 *   dominant. NOTE: loudnorm is NOT applied to the music branch — running
 *   loudnorm on an infinitely looped (-stream_loop -1) stream only emits a
 *   tiny buffer (~0.1s), truncating the whole mix.
 * - amix uses `normalize=0` so volumes are not scaled down by input count.
 * - A final limiter prevents clipping.
 */
export function buildMusicMixFilter(musicPostVolume) {
  const postVol = musicPostVolume != null ? musicPostVolume : 0.8;
  return (
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.0[voice];` +
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,` +
    `volume=${postVol}[music];` +
    `[voice][music]amix=inputs=2:duration=first:dropout_transition=3:normalize=0,` +
    `alimiter=limit=0.95[aout]`
  );
}

/**
 * Pair a (often silent) video clip with a voiceover audio track.
 * Explicitly maps video from input 0 and audio from input 1.
 */
export function mergeShotVideoAndAudio(videoPath, audioPath, outputPath, {
  execFileSync = defaultExecFileSync,
  ffmpegPath = defaultFfmpegPath(),
} = {}) {
  execFileSync(ffmpegPath, [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    outputPath,
  ], { stdio: 'pipe' });
  return outputPath;
}

/**
 * Overlay-audio CLI path: same merge as mergeShotVideoAndAudio, with
 * existsSync validation and mkdir for the output directory.
 */
export function mergeAudioWithVideo(videoPath, audioPath, outputPath, {
  execFileSync = defaultExecFileSync,
  ffmpegPath = defaultFfmpegPath(),
  existsSync = defaultExistsSync,
  mkdirSync = defaultMkdirSync,
  log = (msg) => console.log(msg),
} = {}) {
  if (!existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  if (!existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  mkdirSync(dirname(outputPath), { recursive: true });
  log(`Merging audio (${audioPath}) into video (${videoPath})...`);
  mergeShotVideoAndAudio(videoPath, audioPath, outputPath, { execFileSync, ffmpegPath });
  log(`✅ Final merged video saved: ${outputPath}`);
  return outputPath;
}

/**
 * Mix a voiceover bed with looped background music (ducked via buildMusicMixFilter).
 * Background-music resolution stays in stitch.js; pass an already-resolved musicPath.
 */
export function runMusicMix(voiceoverPath, musicPath, outputPath, musicVolume = 0.8, {
  execFileSync = defaultExecFileSync,
  ffmpegPath = defaultFfmpegPath(),
} = {}) {
  const filter = buildMusicMixFilter(musicVolume);
  execFileSync(ffmpegPath, [
    '-y',
    '-i', voiceoverPath,
    '-stream_loop', '-1',
    '-i', musicPath,
    '-filter_complex', filter,
    '-map', '[aout]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    outputPath,
  ], { stdio: 'pipe' });
  return outputPath;
}
