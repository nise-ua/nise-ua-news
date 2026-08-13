/**
 * Shared per-shot TTS helpers for the reel pipeline.
 * Pronunciation rewrites stay in tts-pronunciation.js (imported here).
 */

import { join } from 'path';
import { execFileSync as defaultExecFileSync } from 'child_process';
import { writeFileSync as defaultWriteFileSync } from 'fs';
import { prepareTtsText } from './tts-pronunciation.js';
import {
  defaultFfmpegPath,
  defaultFfprobePath,
  getAudioDuration,
} from './ffmpeg-helpers.js';

export { getAudioDuration };

function resolveEdgeVoice(env = process.env) {
  const configured = env.EDGE_TTS_VOICE || '';
  return /^uk-UA-/i.test(configured) ? configured : 'uk-UA-PolinaNeural';
}

/** Validated Ukrainian Edge neural voice (default uk-UA-PolinaNeural). */
export const EDGE_VOICE = resolveEdgeVoice();

export function completeClause(text, maxWords = 20, maxChars = 140) {
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

export function synthesizeEdgeTts(text, outPath, {
  voice = EDGE_VOICE,
  execFileSync = defaultExecFileSync,
} = {}) {
  execFileSync('uvx', [
    'edge-tts',
    `--text=${text}`,
    `--voice=${voice}`,
    `--write-media=${outPath}`,
  ], { stdio: 'pipe' });
}

/**
 * @returns {Promise<boolean>} true when audio was written
 */
export async function synthesizeElevenLabs(text, outPath, {
  apiKey,
  voiceId,
  fetchFn = globalThis.fetch,
  writeFileSync = defaultWriteFileSync,
} = {}) {
  if (!apiKey || !voiceId) return false;
  const res = await fetchFn(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) return false;
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return true;
}

export function normalizeAudioToReel(inputPath, outputPath, {
  execFileSync = defaultExecFileSync,
  ffmpegPath = defaultFfmpegPath(),
} = {}) {
  execFileSync(ffmpegPath, [
    '-y', '-i', inputPath,
    '-ar', '48000', '-ac', '2',
    '-codec:a', 'libmp3lame', '-b:a', '192k',
    outputPath,
  ], { stdio: 'pipe' });
}

/**
 * Per-shot TTS for reels: prepareTtsText(completeClause(...)), ElevenLabs
 * (ELEVENLABS_API_KEY + ELEVENLABS_UKRAINIAN_VOICE_ID) with edge-tts fallback,
 * then normalize to 48 kHz stereo.
 *
 * @returns {Promise<Array<{ audioPath: string, duration: number }>>}
 */
export async function generatePerArticleAudio(shots, tempDir, options = {}) {
  const {
    execFileSync = defaultExecFileSync,
    fetchFn = globalThis.fetch,
    writeFileSync = defaultWriteFileSync,
    ffmpeg = defaultFfmpegPath(),
    ffprobe = defaultFfprobePath(),
    log = (msg) => console.log(msg),
    env = process.env,
  } = options;

  const voice = resolveEdgeVoice(env);
  const results = [];

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const rawText = completeClause(shot.spokenText || shot.headline || '');
    const text = prepareTtsText(rawText);
    const mp3Path = join(tempDir, `audio_shot_${i + 1}.mp3`);
    const tmpPath = join(tempDir, `tts_raw_${i + 1}.mp3`);

    if (text !== rawText) {
      log(`  TTS pronunciation: "${rawText.slice(0, 50)}..." → "${text.slice(0, 50)}..."`);
    }
    log(`  Audio ${i + 1}/${shots.length} (${voice}): "${text.slice(0, 50)}..."`);

    const apiKey = env.ELEVENLABS_API_KEY;
    const voiceId = env.ELEVENLABS_UKRAINIAN_VOICE_ID;
    let wrote = false;

    if (apiKey && voiceId) {
      log(`  Using ElevenLabs TTS (voice ${voiceId})...`);
      wrote = await synthesizeElevenLabs(text, tmpPath, {
        apiKey,
        voiceId,
        fetchFn,
        writeFileSync,
      });
      if (!wrote) {
        log(`ElevenLabs error, falling back to edge-tts...`);
      }
    }

    if (!wrote) {
      synthesizeEdgeTts(text, tmpPath, { voice, execFileSync });
    }

    normalizeAudioToReel(tmpPath, mp3Path, { execFileSync, ffmpegPath: ffmpeg });
    results.push({
      audioPath: mp3Path,
      duration: getAudioDuration(mp3Path, { execFileSync, ffprobePath: ffprobe }),
    });
  }

  return results;
}
