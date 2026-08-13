// src/services/video-generator.js

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { updateDigest } from '../db/index.js';
import config, { normalizeReelFrameMode } from '../config.js';


const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '../..');
// Directory where generated reels are placed
const OUTPUT_DIR = join(PIPELINE_ROOT, 'production/video/output');

/**
 * Resolve which reel CLI to spawn for the configured frame mode.
 * @param {string} [mode]
 * @returns {{ mode: 'ai'|'html', scriptPath: string }}
 */
export function resolveReelScript(mode = config.reelFrameMode) {
  const resolved = normalizeReelFrameMode(mode);
  if (resolved === 'html') {
    return {
      mode: 'html',
      scriptPath: join(PIPELINE_ROOT, 'production/html-reel/src/generate-reel-html.js'),
    };
  }
  return {
    mode: 'ai',
    scriptPath: join(PIPELINE_ROOT, 'production/video/src/generate-reel.js'),
  };
}

/**
 * Run the production video generation script for a given digest.
 * The script will place the final reel under production/video/output.
 * Returns the relative URL to the generated video file (served from /static).
 */
const jobs = new Map();
const JOB_RETENTION_MS = 60 * 60 * 1000;

function publicJob(job) {
  return {
    id: job.id,
    digestId: job.digestId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    videoUrl: job.videoUrl || null,
    error: job.error || null,
    reelFrameMode: job.reelFrameMode || null,
    format: job.format || 'facebook',
  };
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: Date.now() });
}

function stageFromOutput(line) {
  if (/Fetching digest|Loaded newest digest|Digest:/i.test(line)) return ['loading', 10];
  if (/Storyboard/i.test(line)) return ['storyboard', 20];
  if (/background image|carousel images|AI 9:16 scene|HTML template frames|HTML hybrid/i.test(line)) {
    return ['images', 40];
  }
  if (/Audio \d+\//i.test(line)) return ['voiceover', 60];
  if (/synchronized video clips|Generating clip|Motion clip/i.test(line)) return ['clips', 75];
  if (/Mixing background|Stitching|Final Synchronized/i.test(line)) return ['stitching', 90];
  return null;
}

export function getVideoJob(jobId) {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

export function findActiveVideoJob(digestId) {
  for (const job of jobs.values()) {
    if (job.digestId === digestId && (job.status === 'queued' || job.status === 'running')) {
      return publicJob(job);
    }
  }
  return null;
}

function buildScriptArgs(digestId, { format = 'facebook' } = {}) {
  const args = [digestId];
  if (format === 'shorts') args.push('--format', 'shorts');
  return args;
}

export function startVideoGeneration(digestId, { format = 'facebook' } = {}) {
  const active = findActiveVideoJob(digestId);
  if (active) return active;

  const { mode, scriptPath } = resolveReelScript();
  const job = {
    id: randomUUID(),
    digestId,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    message: 'Відео додано в чергу',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reelFrameMode: mode,
    format: format === 'shorts' ? 'shorts' : 'facebook',
  };
  jobs.set(job.id, job);

  const child = spawn(
    process.execPath,
    [scriptPath, ...buildScriptArgs(digestId, { format: job.format })],
    { cwd: PIPELINE_ROOT },
  );
  updateJob(job, {
    status: 'running',
    stage: 'starting',
    progress: 5,
    message: mode === 'html'
      ? 'Запуск HTML-гібридного відеопайплайна'
      : 'Запуск відеопайплайна',
  });

  // Capture stdout/stderr for later processing
  let stdout = '';
  let stderr = '';

  // Helper to format UI messages: capitalize first letter and ensure ending punctuation.
  function formatMessage(msg) {
    const trimmed = msg.trim();
    if (!trimmed) return trimmed;
    const capitalized = trimmed[0].toUpperCase() + trimmed.slice(1);
    return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
  }

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    for (const rawLine of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      const stage = stageFromOutput(rawLine);
      if (stage) {
        const cleanMsg = rawLine.replace(/^\[[^\]]+\]\s*/, '');
        const formatted = formatMessage(cleanMsg);
        updateJob(job, { stage: stage[0], progress: Math.max(job.progress, stage[1]), message: formatted });
      }
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (error) => finishVideoJob(job, error));
  child.on('close', (code) => {
    if (code !== 0) {
      const detail = stderr.trim().split(/\r?\n/).filter(Boolean).at(-1) || stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      finishVideoJob(job, new Error(detail || `Відеопайплайн завершився з кодом ${code}`));
      return;
    }
    // Try to extract the explicit path printed by the script.
    const pathLine = stdout.trim().split(/\r?\n/).reverse().find(line => line.trim().startsWith('Path:'));
    let videoPath = pathLine?.replace(/^\s*Path:\s*/, '').trim();
    // Fallback: if the script didn't emit a Path line, look for the newest .mp4 in the output directory.
    if (!videoPath) {
      try {
        const files = readdirSync(OUTPUT_DIR)
          .filter(f => f.endsWith('.mp4'))
          .map(f => ({ name: f, mtime: statSync(join(OUTPUT_DIR, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) {
          videoPath = join(OUTPUT_DIR, files[0].name);
        }
      } catch (e) {
        // ignore – will be handled below if still missing
      }
    }
    if (!videoPath) {
      finishVideoJob(job, new Error('Пайплайн завершився без шляху до готового відео'));
      return;
    }
    const fileName = videoPath.split(/[\\/]/).pop();
    const baseUrl = process.env.BASE_URL || 'https://your-public-domain.com';
    const videoUrl = `${baseUrl}/videos/${encodeURIComponent(fileName)}`;
    const reelUrl = `${baseUrl}/reels/${encodeURIComponent(fileName)}`;
    updateDigest(digestId, { video_url: videoUrl, reel_url: reelUrl });
    updateJob(job, { status: 'completed', stage: 'completed', progress: 100, message: 'Відео готове', videoUrl });
    scheduleJobCleanup(job.id);
  });
  return publicJob(job);
}

function finishVideoJob(job, error) {
  console.error(`[video-generator] ${job.digestId}:`, error);
  updateJob(job, { status: 'failed', stage: 'failed', message: 'Створення відео завершилося з помилкою', error: error.message });
  scheduleJobCleanup(job.id);
}

function scheduleJobCleanup(jobId) {
  setTimeout(() => jobs.delete(jobId), JOB_RETENTION_MS).unref?.();
}

export async function generateVideoForDigest(digestId, { format = 'facebook' } = {}) {
  return new Promise((resolve, reject) => {
    const { scriptPath } = resolveReelScript();
    const child = spawn(
      process.execPath,
      [scriptPath, ...buildScriptArgs(digestId, { format })],
      { cwd: PIPELINE_ROOT },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('close', code => {
      const error = code === 0 ? null : new Error(stderr.trim() || `Video generation failed (${code})`);
      if (error) {
        console.error('[video-generator] exec error:', error);
        return reject(error);
      }
      // Extract the final path from stdout (line containing '.mp4')
      const lines = stdout.trim().split('\n');
      const mp4Line = lines.find(l => l.includes('.mp4'));
      if (!mp4Line) {
        return reject(new Error('Video path not found in script output'));
      }
      const videoPath = mp4Line.replace(/^\s*Path:\s*/, '').trim();
      // Convert absolute path to a URL served by the Express static middleware.
      // The server mounts production/video/output under /videos, so the public
      // URL is just /videos/<filename>.
      const fileName = videoPath.trim().split(/[\\/]/).pop();
      const baseUrl = process.env.BASE_URL || 'https://your-public-domain.com';
      const videoUrl = `${baseUrl}/videos/${encodeURIComponent(fileName)}`;
      const reelUrl = `${baseUrl}/reels/${encodeURIComponent(fileName)}`;
      updateDigest(digestId, { video_url: videoUrl, reel_url: reelUrl });
      resolve(videoUrl);
    });
  });
}
