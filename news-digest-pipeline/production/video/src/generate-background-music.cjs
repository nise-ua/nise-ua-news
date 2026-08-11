#!/usr/bin/env node
/**
 * Generate an energetic, uplifting "news" background-music bed.
 *
 * Synthesizes samples in pure Node (no external audio files required),
 * writes a 16-bit PCM stereo WAV, then encodes to a loud, punchy 48 kHz
 * MP3 via ffmpeg (loudnorm -14 LUFS + limiter).
 *
 * Style: 132 BPM, 4/4, 36 seconds.
 *   - Punchy 808 kick with sub-sweep on every beat
 *   - Driving 16th-note hi-hats with a velocity groove
 *   - Clap/snare on beats 2 & 4
 *   - Pumping off-beat bass (sidechain-ducked under the kick)
 *   - Bright saw chord stabs on the off-beat "push"
 *   - Sparkling 16th-note arpeggio (ping-pong pan)
 *   - Anthemic lead motif that grows every 8 bars
 *   - White-noise risers into section boundaries
 *
 * Output: ../../assets/background-music.mp3
 */
const { execFileSync } = require('child_process');
const { writeFileSync, mkdirSync, existsSync, unlinkSync } = require('fs');
const { join } = require('path');
const ffmpegStatic = require('ffmpeg-static');

const FFMPEG = ffmpegStatic || 'ffmpeg';

const SR = 48000;
const DURATION = 36;
const BPM = 132;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const CHORDS = [
  { root: 220.00, minor: true },   // A3 minor
  { root: 174.61, minor: false },  // F3 major
  { root: 261.63, minor: false },  // C4 major
  { root: 196.00, minor: false },  // G3 major
];

function chordFreqs(i) {
  const c = CHORDS[i % CHORDS.length];
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

function synthesize() {
  const n = Math.floor(SR * DURATION);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const noiseKick = rnd(11);
  const noiseSnare = rnd(22);
  const noiseHat = rnd(33);
  const noiseRiser = rnd(44);

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const barIdx = Math.floor(t / BAR);
    const inBar = t - barIdx * BAR;
    const beatInBar = Math.floor(inBar / BEAT) % 4;
    const posInBeat = (inBar % BEAT) / BEAT;
    const f = chordFreqs(barIdx);

    let l = 0;
    let r = 0;

    // ---- Kick: 808 sub sweep + click, every beat ----
    {
      const env = Math.exp(-7.5 * posInBeat);
      const clickEnv = Math.exp(-180 * posInBeat);
      const sweep = 105 + 45 * Math.pow(1 - posInBeat, 2.5);
      const sub = Math.sin(2 * Math.PI * sweep * posInBeat * BEAT);
      const k = (sub * env * 0.95 + noiseKick() * clickEnv * 0.8) * 0.9;
      l += k;
      r += k;
    }

    // ---- Clap/snare on beats 2 & 4 ----
    if ((beatInBar === 1 || beatInBar === 3) && posInBeat < 0.35) {
      const env = Math.exp(-24 * posInBeat);
      const tone = Math.sin(2 * Math.PI * 195 * posInBeat * BEAT) * 0.5;
      const clap = (noiseSnare() * 0.7 + tone * 0.5) * env * 0.72;
      l += clap;
      r += clap;
    }

    // ---- 16th-note hats, velocity groove, ping-pong pan ----
    {
      const step = BEAT / 4;
      const stepIdx = Math.floor(inBar / step) % 16;
      const posInStep = (inBar % step) / step;
      if (posInStep < 0.22) {
        const open = stepIdx % 8 === 6;
        const acc = stepIdx % 4 === 3 ? 1.0 : 0.65;
        const env = Math.exp(-(open ? 14 : 70) * posInStep);
        const h = noiseHat() * env * (open ? 0.30 : 0.20) * (0.8 + 0.4 * acc);
        const pan = (stepIdx % 4) < 2 ? -0.3 : 0.3;
        l += h * (1 - Math.max(0, pan) + 0.3);
        r += h * (1 + Math.max(0, pan) - 0.3);
      }
    }

    // ---- Pumping bass: 8th notes, sidechain-ducked under the kick ----
    {
      const eighthIdx = Math.floor(inBar / (BEAT / 2)) % 8;
      const posInEighth = (inBar % (BEAT / 2)) / (BEAT / 2);
      const envE = Math.min(1, 14 * posInEighth) * Math.exp(-3.4 * posInEighth);
      const freq = (eighthIdx % 4 === 3) ? f.oct : f.root;
      const b1 = Math.sin(2 * Math.PI * freq * inBar);
      const b2 = 0.5 * Math.sin(2 * Math.PI * freq * 2 * inBar);
      const b3 = 0.25 * Math.sin(2 * Math.PI * freq * 3 * inBar);
      const duck = 1 - 0.72 * Math.exp(-9 * posInBeat);
      const bass = (b1 + b2 + b3) * envE * 0.62 * duck;
      l += bass;
      r += bass;
    }

    // ---- Chord stabs (off-beat push), saw voicing ----
    if ((beatInBar === 0 || beatInBar === 2) && posInBeat > 0.5) {
      const pb = posInBeat - 0.5;
      const env = Math.exp(-11 * pb);
      const attack = Math.min(1, pb * 40);
      const ch =
        Math.sin(2 * Math.PI * f.root * inBar) * 0.55 +
        Math.sin(2 * Math.PI * f.third * inBar) * 0.5 +
        Math.sin(2 * Math.PI * f.fifth * inBar) * 0.4;
      const stab = ch * env * attack * 0.22;
      l += stab;
      r += stab;
    }

    // ---- 16th arpeggio (bright, octave-up, ping-pong) ----
    {
      const step = BEAT / 4;
      const stepIdx = Math.floor(inBar / step) % 16;
      if (stepIdx >= 4) {
        const posInStep = (inBar % step) / step;
        const envA = Math.exp(-16 * posInStep);
        const pattern = [f.oct, f.fifth * 2, f.third * 2, f.oct2];
        const note = pattern[stepIdx % 4];
        const pan = stepIdx % 2 === 0 ? -0.35 : 0.35;
        const a = (Math.sin(2 * Math.PI * note * inBar) * 0.55 +
                   Math.sin(2 * Math.PI * note * 2 * inBar) * 0.18) * envA * 0.17;
        l += a * (1 - Math.max(0, pan));
        r += a * (1 + Math.max(0, pan));
      }
    }

    // ---- Anthemic lead motif on odd bars, grows every 8 bars ----
    {
      const motifBar = barIdx % 8;
      const sectionGain = barIdx >= 24 ? 0.95 : barIdx >= 16 ? 0.8 : barIdx >= 8 ? 0.6 : 0.4;
      if (motifBar % 2 === 1) {
        const motifNotes = [f.oct, f.fifth * 2, f.oct, f.third * 2];
        const note = motifNotes[beatInBar] || motifNotes[0];
        const envM = Math.min(1, posInBeat * 30) * Math.exp(-3.2 * posInBeat);
        const lead = (Math.sin(2 * Math.PI * note * inBar) * 0.7 +
                      Math.sin(2 * Math.PI * note * 2 * inBar) * 0.3 +
                      Math.sin(2 * Math.PI * note * 3 * inBar) * 0.12) * envM * 0.16 * sectionGain;
        l += lead * 0.92;
        r += lead * 0.92;
      }
    }

    // ---- Riser into section boundaries ----
    {
      const barInCycle = barIdx % 8;
      if (barInCycle >= 6) {
        const frac = (barInCycle - 6) / 2;
        const sweepF = 300 + 1400 * frac * frac;
        const riser = (Math.sin(2 * Math.PI * sweepF * t * 0.25) * 0.5 + noiseRiser() * 0.5) * 0.035 * (1 + frac * 2);
        l += riser;
        r += riser;
      }
    }

    // soft-clip + safety
    l = tanh(l * 1.45) * 0.92;
    r = tanh(r * 1.45) * 0.92;
    L[i] = l;
    R[i] = r;
  }

  return { L, R };
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

function main() {
  const { L, R } = synthesize();
  const outDir = join(__dirname, '..', 'assets');
  const wavPath = join(outDir, 'background-music-tmp.wav');
  const mp3Path = join(outDir, 'background-music.mp3');
  mkdirSync(outDir, { recursive: true });

  writeWav(wavPath, L, R);

  execFileSync(FFMPEG, [
    '-y', '-i', wavPath,
    '-ar', '48000', '-ac', '2', '-b:a', '192k',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.97',
    mp3Path,
  ], { stdio: 'pipe' });

  if (existsSync(wavPath)) unlinkSync(wavPath);

  const out = execFileSync(FFMPEG, ['-hide_banner', '-i', mp3Path, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const mean = (out.match(/mean_volume:\s*(-?\d+\.?\d*)\s*dB/) || [])[1];
  const max = (out.match(/max_volume:\s*(-?\d+\.?\d*)\s*dB/) || [])[1];
  console.log(`Done: ${mp3Path}`);
  console.log(`  mean=${mean} dB  max=${max} dB  duration=${DURATION}s (${BPM} BPM)`);
}

main();