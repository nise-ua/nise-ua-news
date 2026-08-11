#!/usr/bin/env node

/**
 * Audio Pipeline — Audio Overlay / Mixer (FFmpeg wrapper)
 *
 * Merges TTS voice-over with background video or stitches audio clips.
 *
 * Usage:
 *   node production/audio/src/overlay-audio.js --video <video-path> --audio <audio-path> [--output <output-path>]
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = ffmpegStatic || 'ffmpeg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export function mergeAudioWithVideo(videoPath, audioPath, outputPath) {
  if (!existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  if (!existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);

  mkdirSync(dirname(outputPath), { recursive: true });

  log(`Merging audio (${audioPath}) into video (${videoPath})...`);

  // FFmpeg command to mix voice-over with video (or replace video audio)
  const cmd = `"${FFMPEG}" -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;

  log(`Executing FFmpeg: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
  log(`✅ Final merged video saved: ${outputPath}`);

  return outputPath;
}

async function main() {
  const args = process.argv.slice(2);
  const videoIdx = args.indexOf('--video');
  const audioIdx = args.indexOf('--audio');
  const outputIdx = args.indexOf('--output');

  if (videoIdx === -1 || audioIdx === -1) {
    console.log('Usage: node production/audio/src/overlay-audio.js --video <video.mp4> --audio <voiceover.mp3> [--output <output.mp4>]');
    process.exit(1);
  }

  const videoPath = args[videoIdx + 1];
  const audioPath = args[audioIdx + 1];
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : join(OUTPUT_DIR, `reel_audio_merged_${timestamp}.mp4`);

  mergeAudioWithVideo(videoPath, audioPath, outputPath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
