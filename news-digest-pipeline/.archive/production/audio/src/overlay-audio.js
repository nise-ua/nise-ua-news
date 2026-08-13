#!/usr/bin/env node

/**
 * Audio Pipeline — Audio Overlay / Mixer (FFmpeg wrapper)
 *
 * Merges TTS voice-over with background video or stitches audio clips.
 *
 * Usage:
 *   node production/audio/src/overlay-audio.js --video <video-path> --audio <audio-path> [--output <output-path>]
 */

import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { mergeAudioWithVideo } from '../../lib/ffmpeg-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');

export { mergeAudioWithVideo };

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
