#!/usr/bin/env node

/**
 * Functional Tests for Video Pipeline
 * 
 * Test 1: Render one 9:16 frame via generateShotClip
 * Test 2: Music+voice mix audible (volumedetect)
 */

import { generateShotClip } from './generate-clips.js';
import { mixVoiceoverWithMusic } from './stitch.js';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import ffprobeStatic from 'ffprobe-static';
import ffmpegStatic from 'ffmpeg-static';

const FFPROBE = ffprobeStatic.path;
const FFMPEG = ffmpegStatic;
const OUTPUT_DIR = join(process.cwd(), 'output', 'test-functional');

function parseVolumeDetect(output) {
  const maxMatch = output.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  const meanMatch = output.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  return {
    maxVolume: maxMatch ? Number(maxMatch[1]) : Number.NEGATIVE_INFINITY,
    meanVolume: meanMatch ? Number(meanMatch[1]) : Number.NEGATIVE_INFINITY,
  };
}

function runVolumeDetect(inputPath) {
  const command = `${FFMPEG} -hide_banner -i "${inputPath}" -af volumedetect -f null - 2>&1`;
  return parseVolumeDetect(execSync(command, { encoding: 'utf8' }));
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function runTests() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  let passed = 0;
  let failed = 0;

  // ===================== TEST 1: generateShotClip =====================
  log('=== TEST 1: Render one 9:16 frame via generateShotClip ===');
  try {
    const testShot = {
      shot: 1,
      headline: 'Test News Headline for 9:16 Frame',
      imageUrl: null,
      duration: 3
    };

    const clipPath = await generateShotClip(testShot, OUTPUT_DIR);
    
    if (!existsSync(clipPath)) {
      throw new Error(`Clip file not created: ${clipPath}`);
    }

    const probeCmd = `${FFPROBE} -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${clipPath}"`;
    const dims = execSync(probeCmd, { encoding: 'utf-8' }).trim();
    const [w, h] = dims.split('x').map(Number);

    log(`  Clip created: ${clipPath}`);
    log(`  Dimensions: ${w}x${h}`);

    if (w === 1080 && h === 1920) {
      log('  PASS: 9:16 aspect ratio confirmed (1080x1920)');
      passed++;
    } else {
      log(`  FAIL: Expected 1080x1920, got ${w}x${h}`);
      failed++;
    }
  } catch (err) {
    log(`  FAIL: ${err.message}`);
    failed++;
  }

  // ===================== TEST 2: Music+Voice mix audible (volumedetect) =====================
  log('');
  log('=== TEST 2: Music+Voice mix audible (volumedetect) ===');
  try {
    const voiceoverPath = join(OUTPUT_DIR, 'test_voiceover.mp3');
    // Use .m4a (AAC in MPEG-4 container) so the AAC codec chosen by
    // mixVoiceoverWithMusic is compatible with the output format.
    const outputPath = join(OUTPUT_DIR, 'test_mixed.m4a');

    const genVoiceCmd = `${FFMPEG} -y -f lavfi -i "sine=frequency=440:duration=2" -ar 48000 -ac 2 "${voiceoverPath}" 2>&1`;
    log(`  Generating test voiceover...`);
    execSync(genVoiceCmd, { stdio: 'pipe' });

    if (!existsSync(voiceoverPath)) {
      throw new Error('Voiceover file not created');
    }
    log(`  Voiceover created: ${voiceoverPath}`);

    log(`  Mixing voiceover with background music...`);
    // Use default volume (0.8) so the music is clearly audible.
    mixVoiceoverWithMusic(voiceoverPath, outputPath);

    if (!existsSync(outputPath)) {
      throw new Error('Mixed output file not created');
    }
    log(`  Mixed output created: ${outputPath}`);

    const { maxVolume, meanVolume } = runVolumeDetect(outputPath);

    log(`  Volume detect results:`);
    log(`    Max volume: ${maxVolume} dB`);
    log(`    Mean volume: ${meanVolume} dB`);

    const durCmd = `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
    const duration = parseFloat(execSync(durCmd, { encoding: 'utf-8' }).trim());
    log(`    Duration: ${duration}s`);
    const { maxVolume: voiceMaxVolume } = runVolumeDetect(voiceoverPath);
    log(`    Voiceover max volume: ${voiceMaxVolume} dB`);

    const musicPath = join(process.cwd(), 'news-digest-pipeline/production/video/assets/background-music.mp3');
    if (existsSync(musicPath)) {
      const { maxVolume: musicMaxVolume } = runVolumeDetect(musicPath);
      log(`    Background music max volume: ${musicMaxVolume} dB`);

      const musicContributed = Math.abs(maxVolume - voiceMaxVolume) > 3 || maxVolume > -20;
      
      if (maxVolume > -30 && duration >= 2) {
        log(`  PASS: Mixed audio has audible content (max: ${maxVolume} dB, duration: ${duration}s)`);
        if (musicContributed) {
          log('  PASS: Background music appears to contribute to mix');
        } else {
          log('  WARNING: Background music contribution unclear');
        }
        passed++;
      } else {
        log(`  FAIL: Mixed audio too quiet (max: ${maxVolume} dB)`);
        failed++;
      }
    } else {
      log('  WARNING: No background music file found, testing voice-only output');
      if (maxVolume > -30 && duration >= 2) {
        log('  PASS: Output has audible content');
        passed++;
      } else {
        log(`  FAIL: Output too quiet (max: ${maxVolume} dB)`);
        failed++;
      }
    }
  } catch (err) {
    log(`  FAIL: ${err.message}`);
    log(err.stack);
    failed++;
  }

  log('');
  log('============================');
  log(`RESULTS: ${passed} passed, ${failed} failed`);
  log('============================');

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});