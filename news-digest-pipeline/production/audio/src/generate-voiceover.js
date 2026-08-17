#!/usr/bin/env node

/**
 * Audio Pipeline — TTS Voice-Over Generator
 *
 * Reads digest text → summarizes/formats for audio voice-over (~500 chars for Reels or full digest for Podcast)
 * → Generates TTS MP3 via OpenAI TTS / ElevenLabs / Google Cloud TTS.
 *
 * Per-shot reel TTS lives in production/lib/tts.js (edge-tts + Ukrainian ElevenLabs).
 * This CLI keeps the OpenAI/ElevenLabs podcast-style single-file path.
 *
 * Usage:
 *   node production/audio/src/generate-voiceover.js latest [--mode reel|podcast]
 *   node production/audio/src/generate-voiceover.js <digest-id>
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { getDigestContent } from '../../lib/digest.js';
import { prepareTtsText } from '../../lib/tts-pronunciation.js';
import {
  generatePerArticleAudio,
  getAudioDuration,
} from '../../lib/tts.js';
import { callLlmText } from '../../lib/llm-backends.js';
import { log, projectRoot, scriptDir } from '../../lib/logging.js';

const __dirname = scriptDir(import.meta.url);
const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const OUTPUT_DIR = join(__dirname, '..', 'output');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init'
});

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-init'
});

export { getAudioDuration, generatePerArticleAudio };

async function prepareAudioScript(digestText, mode = 'reel') {
  log(`Preparing audio script for ${mode} mode...`);

  if (mode === 'reel') {
    const prompt = `Ти — ведучий новинного Instagram Reels/Shorts каналу.
Адаптуй цей дайджест у короткий динамічний закадровий текст (до 500-600 символів, близько 45-60 секунд читання).
Мова: українська.
Текст має бути максимально живим, захоплюючим, з короткими реченнями та чіткими акцентами.
Поверни ТІЛЬКИ текст диктора, без приміток чи маркерів.`;

    try {
      const text = await callLlmText({
        system: prompt,
        user: `Дайджест:\n${digestText.slice(0, 3000)}`,
        title: 'NiSeNews audio voiceover',
      });
      return text.trim();
    } catch (err) {
      log(`AI script generation failed (${err.message}), using raw digest text.`);
    }
  }

  return digestText.slice(0, 2000);
}

async function generateTTS(scriptText) {
  log(`Generating TTS audio (${scriptText.length} chars)...`);
  const spoken = prepareTtsText(scriptText);

  // Option 1: ElevenLabs API (if ELEVENLABS_API_KEY provided)
  // Note: podcast CLI uses ELEVENLABS_VOICE_ID (any voice); reel shared lib
  // requires ELEVENLABS_UKRAINIAN_VOICE_ID.
  if (process.env.ELEVENLABS_API_KEY) {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    log('Using ElevenLabs TTS API...');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: spoken,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });
    if (res.ok) {
      return Buffer.from(await res.arrayBuffer());
    }
    log(`ElevenLabs API error (${res.status}), falling back to OpenAI TTS...`);
  }

  // Option 2: OpenAI TTS API
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing for TTS generation.');
  }

  log('Using OpenAI TTS API (tts-1, voice: onyx)...');
  const voice = process.env.TTS_VOICE || 'onyx'; // onyx, alloy, echo, fable, nova, shimmer
  const mp3 = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice,
    input: spoken,
  });

  return Buffer.from(await mp3.arrayBuffer());
}

async function main() {
  const args = process.argv.slice(2);
  const digestId = args.find(a => !a.startsWith('--')) || 'latest';
  const mode = args.includes('--podcast') ? 'podcast' : 'reel';

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const digestText = await getDigestContent(digestId, { log });
  const audioScript = await prepareAudioScript(digestText, mode);
  log(`Script prepared:\n"${audioScript.slice(0, 150)}..."`);

  const audioBuffer = await generateTTS(audioScript);

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const filename = `voiceover_${mode}_${timestamp}.mp3`;
  const filepath = join(OUTPUT_DIR, filename);

  writeFileSync(filepath, audioBuffer);
  log(`✅ Voice-over audio saved: ${filepath} (${audioBuffer.length} bytes)`);

  return filepath;
}

// Only run the CLI when this file is executed directly, not when imported
// (e.g. by the video pipeline which needs generatePerArticleAudio).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
