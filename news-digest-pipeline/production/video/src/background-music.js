#!/usr/bin/env node

/**
 * Synthesize TV-news-style background music beds.
 *
 * Each run picks one of several distinct arrangement templates (anthem, ticker,
 * breaking, broadcast, pulse) plus key/tempo variation from a seed.
 */

import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = ffmpegStatic || 'ffmpeg';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets');

const SR = 48000;
const DEFAULT_DURATION = 36;

export const MUSIC_STYLES = {
  anthem: { label: 'Anthem Drive', bpmOptions: [132, 136, 140, 144, 148] },
  ticker: { label: 'News Ticker', bpmOptions: [128, 132, 136, 140, 144] },
  breaking: { label: 'Breaking News', bpmOptions: [140, 144, 148, 152, 156] },
  broadcast: { label: 'Broadcast Bed', bpmOptions: [96, 100, 104, 108, 112] },
  pulse: { label: 'Corporate Pulse', bpmOptions: [128, 132, 136, 140, 144] },
  rush: { label: 'Deadline Rush', bpmOptions: [144, 148, 152, 156, 160] },
};

// Broadcast stays available for explicit CLI use but is never auto-picked:
// its pad bed reads as the same flat sine wash under TTS.
const STYLE_KEYS = ['anthem', 'ticker', 'breaking', 'pulse', 'rush'];

export function pickStyleKey(seed) {
  const n = Math.abs(Math.trunc(Number(seed) || 1));
  // Mix millisecond bits. `floor(ms / 1000) % N` aliases every 4 seconds and
  // every whole-minute wait (60 % 4 === 0), so consecutive reels reused Anthem.
  const mixed = (Math.imul(n, 0x9e3779b9) ^ (n >>> 11) ^ (n << 7)) >>> 0;
  return STYLE_KEYS[mixed % STYLE_KEYS.length];
}

const PROGRESSIONS = [
  [
    { root: 220.0, minor: true },
    { root: 174.61, minor: false },
    { root: 261.63, minor: false },
    { root: 196.0, minor: false },
  ],
  [
    { root: 293.66, minor: true },
    { root: 233.08, minor: false },
    { root: 349.23, minor: false },
    { root: 261.63, minor: false },
  ],
  [
    { root: 164.81, minor: true },
    { root: 130.81, minor: false },
    { root: 196.0, minor: false },
    { root: 146.83, minor: false },
  ],
  [
    { root: 261.63, minor: true },
    { root: 207.65, minor: false },
    { root: 311.13, minor: false },
    { root: 233.08, minor: false },
  ],
  [
    { root: 196.0, minor: true },
    { root: 155.56, minor: false },
    { root: 233.08, minor: false },
    { root: 174.61, minor: false },
  ],
  [
    { root: 246.94, minor: true },
    { root: 196.0, minor: false },
    { root: 293.66, minor: false },
    { root: 220.0, minor: false },
  ],
];

function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function transposeFreq(freq, semitones) {
  return freq * Math.pow(2, semitones / 12);
}

export function buildMusicConfig(seed = Date.now()) {
  const rand = seededRandom(seed);
  const styleKey = pickStyleKey(seed);
  const style = MUSIC_STYLES[styleKey];
  const bpm = style.bpmOptions[Math.floor(rand() * style.bpmOptions.length)];
  const progression = PROGRESSIONS[Math.floor(rand() * PROGRESSIONS.length)];
  const transpose = Math.floor(rand() * 12);
  const chords = progression.map(chord => ({
    root: transposeFreq(chord.root, transpose),
    minor: chord.minor,
  }));
  const noiseSeeds = [
    11 + Math.floor(rand() * 10000),
    22 + Math.floor(rand() * 10000),
    33 + Math.floor(rand() * 10000),
    44 + Math.floor(rand() * 10000),
  ];
  return { seed, styleKey, styleLabel: style.label, bpm, chords, noiseSeeds };
}

function chordFreqs(chords, barIdx) {
  const c = chords[barIdx % chords.length];
  const third = c.root * (c.minor ? Math.pow(2, 3 / 12) : Math.pow(2, 4 / 12));
  const fifth = c.root * Math.pow(2, 7 / 12);
  return { root: c.root, third, fifth, oct: c.root * 2, oct2: c.root * 4 };
}

function rnd(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
}

function tanh(x) {
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
}

function osc(freq, t, kind = 'sine') {
  const p = 2 * Math.PI * freq * t;
  const s = Math.sin(p);
  if (kind === 'square') return Math.sign(s) * 0.62 + Math.sin(p * 3) * 0.22;
  if (kind === 'saw') {
    return s + Math.sin(p * 2) * 0.48 + Math.sin(p * 3) * 0.24 + Math.sin(p * 4) * 0.12;
  }
  return s;
}

function makeNoise(config) {
  return {
    kick: rnd(config.noiseSeeds[0]),
    snare: rnd(config.noiseSeeds[1]),
    hat: rnd(config.noiseSeeds[2]),
    riser: rnd(config.noiseSeeds[3]),
  };
}

function finalizeSample(l, r) {
  return [tanh(l * 1.45) * 0.92, tanh(r * 1.45) * 0.92];
}

function addKick(l, r, posInBeat, beat, noiseKick, gain = 0.9) {
  const env = Math.exp(-7.5 * posInBeat);
  const clickEnv = Math.exp(-180 * posInBeat);
  const sweep = 105 + 45 * Math.pow(1 - posInBeat, 2.5);
  const sub = Math.sin(2 * Math.PI * sweep * posInBeat * beat);
  const k = (sub * env * 0.95 + noiseKick() * clickEnv * 0.8) * gain;
  return [l + k, r + k];
}

function addClap(l, r, posInBeat, beat, noiseSnare, gain = 0.72) {
  const env = Math.exp(-24 * posInBeat);
  const tone = Math.sin(2 * Math.PI * 195 * posInBeat * beat) * 0.5;
  const clap = (noiseSnare() * 0.7 + tone * 0.5) * env * gain;
  return [l + clap, r + clap];
}

function addHats(l, r, inBar, beat, noiseHat, { density = 4, gain = 0.2, openEvery = 8 } = {}) {
  const step = beat / density;
  const stepIdx = Math.floor(inBar / step) % (density * 4);
  const posInStep = (inBar % step) / step;
  if (posInStep >= 0.22) return [l, r];
  const open = stepIdx % openEvery === openEvery - 2;
  const env = Math.exp(-(open ? 14 : 70) * posInStep);
  const h = noiseHat() * env * (open ? gain * 1.5 : gain);
  const pan = stepIdx % 2 === 0 ? -0.25 : 0.25;
  return [l + h * (1 - Math.max(0, pan)), r + h * (1 + Math.max(0, pan))];
}

function addPad(l, r, inBar, f, gain = 0.14) {
  const ch =
    Math.sin(2 * Math.PI * f.root * inBar) * 0.55 +
    Math.sin(2 * Math.PI * f.third * inBar) * 0.5 +
    Math.sin(2 * Math.PI * f.fifth * inBar) * 0.4;
  const pad = ch * gain;
  return [l + pad, r + pad];
}

function synthesizeAnthem(config, duration) {
  const { bpm, chords } = config;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = Math.floor(SR * duration);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = makeNoise(config);

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const barIdx = Math.floor(t / bar);
    const inBar = t - barIdx * bar;
    const beatInBar = Math.floor(inBar / beat) % 4;
    const posInBeat = (inBar % beat) / beat;
    const f = chordFreqs(chords, barIdx);
    let [l, r] = addKick(0, 0, posInBeat, beat, noise.kick, 1.05);
    if ((beatInBar === 1 || beatInBar === 3) && posInBeat < 0.4) {
      [l, r] = addClap(l, r, posInBeat, beat, noise.snare, 0.88);
    }
    [l, r] = addHats(l, r, inBar, beat, noise.hat, { density: 4, gain: 0.26 });
    {
      const eighthIdx = Math.floor(inBar / (beat / 2)) % 8;
      const posInEighth = (inBar % (beat / 2)) / (beat / 2);
      const envE = Math.min(1, 16 * posInEighth) * Math.exp(-3.1 * posInEighth);
      const freq = (eighthIdx % 4 === 3) ? f.oct : f.root;
      const bass = osc(freq, inBar, 'saw') * envE * 0.42 * (1 - 0.7 * Math.exp(-9 * posInBeat));
      l += bass; r += bass;
    }
    const pad = (osc(f.root, inBar, 'saw') * 0.28 + osc(f.third, inBar, 'saw') * 0.22) * 0.16;
    l += pad * 0.92; r += pad * 1.08;
    if (barIdx % 2 === 1) {
      const note = [f.oct, f.fifth * 2, f.oct2, f.third * 2][beatInBar];
      const envM = Math.min(1, posInBeat * 28) * Math.exp(-2.6 * posInBeat);
      const lead = osc(note, inBar, 'square') * envM * 0.2;
      l += lead; r += lead * 0.85;
    }
    [l, r] = finalizeSample(l, r);
    L[i] = l; R[i] = r;
  }
  return { L, R };
}

function synthesizeTicker(config, duration) {
  const { bpm, chords } = config;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = Math.floor(SR * duration);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = makeNoise(config);

  for (let i = 0; i < n; i++) {
    const barIdx = Math.floor(i / SR / bar);
    const inBar = (i / SR) - barIdx * bar;
    const beatInBar = Math.floor(inBar / beat) % 4;
    const posInBeat = (inBar % beat) / beat;
    const f = chordFreqs(chords, barIdx);
    let l = 0; let r = 0;
    if (posInBeat < 0.18) {
      [l, r] = addKick(l, r, posInBeat, beat, noise.kick, beatInBar % 2 === 0 ? 0.95 : 0.55);
    }
    [l, r] = addHats(l, r, inBar, beat, noise.hat, { density: 8, gain: 0.22, openEvery: 8 });
    const sixteenth = beat / 4;
    const step = Math.floor(inBar / sixteenth) % 16;
    const posStep = (inBar % sixteenth) / sixteenth;
    const arpNotes = [f.oct, f.fifth * 2, f.oct2, f.third * 2, f.oct, f.fifth * 2, f.oct * 1.5, f.oct2];
    const arpEnv = Math.min(1, posStep * 22) * Math.exp(-8 * posStep);
    const arp = osc(arpNotes[step % arpNotes.length], inBar, 'square') * arpEnv * 0.18;
    l += arp * 1.1; r += arp * 0.9;
    const bass = osc(f.root, inBar, 'saw') * (1 - 0.8 * Math.exp(-11 * posInBeat)) * 0.38;
    l += bass; r += bass;
    [l, r] = finalizeSample(l, r);
    L[i] = l; R[i] = r;
  }
  return { L, R };
}

function synthesizeBreaking(config, duration) {
  const { bpm, chords } = config;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = Math.floor(SR * duration);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = makeNoise(config);

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const barIdx = Math.floor(t / bar);
    const inBar = t - barIdx * bar;
    const beatInBar = Math.floor(inBar / beat) % 4;
    const posInBeat = (inBar % beat) / beat;
    const f = chordFreqs(chords, barIdx);
    let [l, r] = addKick(0, 0, posInBeat, beat, noise.kick, 1.12);
    if ((beatInBar === 1 || beatInBar === 3) && posInBeat < 0.45) {
      [l, r] = addClap(l, r, posInBeat, beat, noise.snare, 0.95);
    }
    [l, r] = addHats(l, r, inBar, beat, noise.hat, { density: 8, gain: 0.3, openEvery: 4 });
    const bassNote = beatInBar % 2 === 0 ? f.root : f.oct;
    const bass = osc(bassNote, inBar, 'saw') * Math.exp(-5.2 * posInBeat) * 0.5;
    l += bass; r += bass;
    if (posInBeat < 0.12) {
      const stab = osc(f.fifth * 2, inBar, 'square') * 0.22;
      l += stab * 0.85; r += stab;
    }
    if (barIdx % 8 >= 6) {
      const frac = (barIdx % 8 - 6) / 2;
      const riser = noise.riser() * 0.08 * (1 + frac);
      l += riser; r += riser;
    }
    [l, r] = finalizeSample(l, r);
    L[i] = l; R[i] = r;
  }
  return { L, R };
}

function synthesizeBroadcast(config, duration) {
  const { bpm, chords } = config;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = Math.floor(SR * duration);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = makeNoise(config);

  for (let i = 0; i < n; i++) {
    const barIdx = Math.floor(i / SR / bar);
    const inBar = (i / SR) - barIdx * bar;
    const beatInBar = Math.floor(inBar / beat) % 4;
    const posInBeat = (inBar % beat) / beat;
    const f = chordFreqs(chords, barIdx);
    let l = 0; let r = 0;
    if (beatInBar === 0 && posInBeat < 0.15) {
      [l, r] = addKick(l, r, posInBeat, beat, noise.kick, 0.35);
    }
    if ((beatInBar === 2) && posInBeat < 0.2) {
      const rim = Math.sin(2 * Math.PI * 420 * posInBeat) * Math.exp(-30 * posInBeat) * 0.12;
      l += rim; r += rim;
    }
    [l, r] = addPad(l, r, inBar, f, 0.16);
    const bassLine = Math.sin(2 * Math.PI * f.root * 0.5 * inBar) * 0.22;
    l += bassLine; r += bassLine;
    if (barIdx % 4 === 3) {
      const swell = Math.sin(Math.PI * inBar / bar) * 0.04;
      l += swell; r += swell;
    }
    [l, r] = finalizeSample(l, r);
    L[i] = l; R[i] = r;
  }
  return { L, R };
}

function synthesizePulse(config, duration) {
  const { bpm, chords } = config;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = Math.floor(SR * duration);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = makeNoise(config);

  for (let i = 0; i < n; i++) {
    const barIdx = Math.floor(i / SR / bar);
    const inBar = (i / SR) - barIdx * bar;
    const beatInBar = Math.floor(inBar / beat) % 4;
    const posInBeat = (inBar % beat) / beat;
    const f = chordFreqs(chords, barIdx);
    let l = 0; let r = 0;
    if (posInBeat < 0.14) {
      [l, r] = addKick(l, r, posInBeat, beat, noise.kick, 0.92);
    }
    [l, r] = addHats(l, r, inBar, beat, noise.hat, { density: 8, gain: 0.2, openEvery: 6 });
    const pump = 1 - 0.9 * Math.exp(-9 * posInBeat);
    const bass = osc(f.root, inBar, 'saw') * pump * 0.5;
    l += bass; r += bass;
    if (beatInBar % 2 === 1 && posInBeat > 0.4 && posInBeat < 0.72) {
      const stab = (osc(f.third, inBar, 'square') + osc(f.fifth, inBar, 'square') * 0.6) * 0.14;
      l += stab * 0.9; r += stab;
    }
    [l, r] = finalizeSample(l, r);
    L[i] = l; R[i] = r;
  }
  return { L, R };
}

function synthesizeRush(config, duration) {
  const { bpm, chords } = config;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = Math.floor(SR * duration);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noise = makeNoise(config);

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const barIdx = Math.floor(t / bar);
    const inBar = t - barIdx * bar;
    const beatInBar = Math.floor(inBar / beat) % 4;
    const posInBeat = (inBar % beat) / beat;
    const f = chordFreqs(chords, barIdx);
    let [l, r] = addKick(0, 0, posInBeat, beat, noise.kick, 1.08);
    if (beatInBar === 3 && posInBeat < 0.5) {
      [l, r] = addClap(l, r, posInBeat, beat, noise.snare, 1.0);
    } else if ((beatInBar === 1) && posInBeat < 0.35) {
      [l, r] = addClap(l, r, posInBeat, beat, noise.snare, 0.7);
    }
    [l, r] = addHats(l, r, inBar, beat, noise.hat, { density: 8, gain: 0.28, openEvery: 4 });
    const gallop = posInBeat < 0.33 || (posInBeat > 0.5 && posInBeat < 0.72);
    if (gallop) {
      const gp = posInBeat < 0.33 ? posInBeat / 0.33 : (posInBeat - 0.5) / 0.22;
      const bass = osc(beatInBar === 3 ? f.oct : f.root, inBar, 'saw') * Math.exp(-4 * gp) * 0.48;
      l += bass; r += bass;
    }
    const leadNote = [f.oct2, f.fifth * 2, f.oct, f.third * 2][(barIdx + beatInBar) % 4];
    const lead = osc(leadNote, inBar, 'square') * Math.min(1, posInBeat * 18) * Math.exp(-4.5 * posInBeat) * 0.16;
    l += lead * 0.85; r += lead;
    [l, r] = finalizeSample(l, r);
    L[i] = l; R[i] = r;
  }
  return { L, R };
}

const SYNTHESIZERS = {
  anthem: synthesizeAnthem,
  ticker: synthesizeTicker,
  breaking: synthesizeBreaking,
  broadcast: synthesizeBroadcast,
  pulse: synthesizePulse,
  rush: synthesizeRush,
};

export function synthesizeBackgroundMusic(config, duration) {
  const synth = SYNTHESIZERS[config.styleKey] || synthesizeAnthem;
  return synth(config, duration);
}

function writeWav(path, left, right) {
  const n = left.length;
  const dataSize = n * 4;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const li = Math.max(-1, Math.min(1, left[i]));
    const ri = Math.max(-1, Math.min(1, right[i]));
    const off = 44 + i * 4;
    buf.writeInt16LE(Math.round(li * 32767), off);
    buf.writeInt16LE(Math.round(ri * 32767), off + 2);
  }
  writeFileSync(path, buf);
}

function encodeWavToMp3(wavPath, mp3Path) {
  execFileSync(FFMPEG, [
    '-y', '-i', wavPath,
    '-ar', '48000', '-ac', '2', '-b:a', '192k',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.97',
    mp3Path,
  ], { stdio: 'pipe' });
}

export function musicSeedFor(digestId, now = Date.now()) {
  let h = Number(now) >>> 0;
  const id = String(digestId || '');
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 33) + id.charCodeAt(i)) >>> 0;
  }
  return (h ^ ((Number(now) >>> 8) * 2654435761)) >>> 0 || 1;
}

export function generateBackgroundMusic({ seed, outputPath, duration = DEFAULT_DURATION } = {}) {
  if (!outputPath) throw new Error('outputPath is required');
  const resolvedSeed = seed != null ? Number(seed) : Date.now();
  const config = buildMusicConfig(resolvedSeed);
  const { L, R } = synthesizeBackgroundMusic(config, duration);

  mkdirSync(dirname(outputPath), { recursive: true });
  const wavPath = outputPath.replace(/\.mp3$/i, '-tmp.wav');
  writeWav(wavPath, L, R);
  encodeWavToMp3(wavPath, outputPath);
  if (existsSync(wavPath)) unlinkSync(wavPath);

  return { outputPath, config };
}

export function defaultAssetPath() {
  return join(ASSETS_DIR, 'background-music.mp3');
}

export function reelMusicPathFor(reelPath) {
  return reelPath.replace(/(reel|shorts)_([^.]+)\.mp4$/i, '$1-music_$2.mp3');
}
