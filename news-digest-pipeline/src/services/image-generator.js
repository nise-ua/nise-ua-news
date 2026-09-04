/**
 * Async Facebook digest-cover generation.
 * Spawns production/image/src/generate-digest-cover.js and stores image_url.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { updateDigest } from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '../..');
const SCRIPT_PATH = join(PIPELINE_ROOT, 'production/image/src/generate-digest-cover.js');
const OUTPUT_DIR = join(PIPELINE_ROOT, 'production/image/output');

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
    imageUrl: job.imageUrl || null,
    error: job.error || null,
  };
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: Date.now() });
}

function stageFromOutput(line) {
  if (/Fetching digest|Loaded newest digest|Digest:/i.test(line)) return ['loading', 10];
  if (/Selecting top news|Cover pick|Cover selection/i.test(line)) return ['selecting', 30];
  if (/Generating text-free|Cover image|Image vendor/i.test(line)) return ['images', 65];
  if (/Digest cover saved|Stored cover URL/i.test(line)) return ['saving', 90];
  return null;
}

export function getImageJob(jobId) {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

export function findActiveImageJob(digestId) {
  for (const job of jobs.values()) {
    if (job.digestId === digestId && (job.status === 'queued' || job.status === 'running')) {
      return publicJob(job);
    }
  }
  return null;
}

function publicImageUrlFromPath(imagePath) {
  const fileName = String(imagePath || '').split(/[\\/]/).pop();
  const baseUrl = process.env.BASE_URL || 'https://your-public-domain.com';
  return `${baseUrl}/images/${encodeURIComponent(fileName)}`;
}

function persistGeneratedImageUrl(digestId, imagePath) {
  const imageUrl = publicImageUrlFromPath(imagePath);
  updateDigest(digestId, { image_url: imageUrl });
  return imageUrl;
}

export function startImageGeneration(digestId) {
  const active = findActiveImageJob(digestId);
  if (active) return active;

  const job = {
    id: randomUUID(),
    digestId,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    message: 'Обкладинку додано в чергу',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);

  const child = spawn(process.execPath, [SCRIPT_PATH, digestId], { cwd: PIPELINE_ROOT });
  updateJob(job, {
    status: 'running',
    stage: 'starting',
    progress: 5,
    message: 'Запуск генерації обкладинки',
  });

  let stdout = '';
  let stderr = '';

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
        updateJob(job, {
          stage: stage[0],
          progress: Math.max(job.progress, stage[1]),
          message: formatMessage(cleanMsg),
        });
      }
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (error) => finishImageJob(job, error));
  child.on('close', (code) => {
    if (code !== 0) {
      const detail = stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)
        || stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      finishImageJob(job, new Error(detail || `Пайплайн обкладинки завершився з кодом ${code}`));
      return;
    }
    const pathLine = stdout.trim().split(/\r?\n/).reverse().find((line) => line.trim().startsWith('Path:'));
    let imagePath = pathLine?.replace(/^\s*Path:\s*/, '').trim();
    if (!imagePath) {
      try {
        const files = readdirSync(OUTPUT_DIR)
          .filter((name) => /^digest-cover_.*\.png$/i.test(name))
          .map((name) => ({ name, mtime: statSync(join(OUTPUT_DIR, name)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) imagePath = join(OUTPUT_DIR, files[0].name);
      } catch {
        // handled below
      }
    }
    if (!imagePath) {
      finishImageJob(job, new Error('Пайплайн завершився без шляху до обкладинки'));
      return;
    }
    const imageUrl = persistGeneratedImageUrl(digestId, imagePath);
    updateJob(job, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      message: 'Обкладинка готова',
      imageUrl,
    });
    scheduleJobCleanup(job.id);
  });
  return publicJob(job);
}

function finishImageJob(job, error) {
  console.error(`[image-generator] ${job.digestId}:`, error);
  updateJob(job, {
    status: 'failed',
    stage: 'failed',
    message: 'Створення обкладинки завершилося з помилкою',
    error: error.message,
  });
  scheduleJobCleanup(job.id);
}

function scheduleJobCleanup(jobId) {
  setTimeout(() => jobs.delete(jobId), JOB_RETENTION_MS).unref?.();
}

export function coverScriptPath() {
  return SCRIPT_PATH;
}
