/**
 * Phase 1 OpenRouter video adapter for x-ai/grok-imagine-video-1.5.
 *
 * This module intentionally has no FFmpeg, image, TTS, or application imports.
 * It owns only submit -> poll -> download for one generated MP4.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const DEFAULT_MODEL = 'x-ai/grok-imagine-video-1.5';
export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
export const SUPPORTED_DURATIONS = Object.freeze(Array.from({ length: 15 }, (_, i) => i + 1));
export const SUPPORTED_RESOLUTIONS = Object.freeze(['480p', '720p', '1080p']);
export const SUPPORTED_ASPECT_RATIOS = Object.freeze(['16:9', '9:16']);

const TERMINAL_FAILURES = new Set(['failed', 'cancelled', 'expired']);

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function redact(value) {
  return value ? `${value.slice(0, 4)}…${value.slice(-2)}` : '(missing)';
}

function assertChoice(name, value, choices) {
  if (!choices.includes(value)) {
    throw new Error(`${name} must be one of: ${choices.join(', ')}; received ${value}`);
  }
}

export function createVeoRequest(options = {}) {
  const request = {
    model: options.model || DEFAULT_MODEL,
    prompt: String(options.prompt || '').trim(),
    duration: options.duration ?? 8,
    resolution: options.resolution || '720p',
    aspect_ratio: options.aspectRatio || '9:16',
  };

  // Grok Imagine Video 1.5 does not advertise a generate_audio control.
  // Keep the field opt-in so we do not send Veo-specific parameters to Grok.
  if (options.generateAudio !== undefined) request.generate_audio = options.generateAudio;

  if (!request.prompt) throw new Error('Video prompt must not be empty');
  assertChoice('duration', request.duration, SUPPORTED_DURATIONS);
  assertChoice('resolution', request.resolution, SUPPORTED_RESOLUTIONS);
  assertChoice('aspect_ratio', request.aspect_ratio, SUPPORTED_ASPECT_RATIOS);

  if (options.firstFrame) request.first_frame = options.firstFrame;
  if (options.lastFrame) request.last_frame = options.lastFrame;
  if (options.seed !== undefined) request.seed = options.seed;
  if (options.providerOptions) Object.assign(request, options.providerOptions);
  return request;
}

export function createVeoClient(options = {}) {
  const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
  const baseUrl = (options.baseUrl || process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  if (typeof fetchImpl !== 'function') throw new Error('This adapter requires Node.js 20+ fetch');

  async function request(path, init = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.BASE_URL ? { 'HTTP-Referer': process.env.BASE_URL } : {}),
        'X-Title': 'NiSeNews direct video V2',
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenRouter ${init.method || 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    return response;
  }

  return {
    async submit(videoOptions) {
      const requestBody = createVeoRequest(videoOptions);
      const response = await request('/videos', { method: 'POST', body: JSON.stringify(requestBody) });
      const job = await response.json();
      if (!job?.id) throw new Error('OpenRouter video response did not contain a job id');
      return { ...job, request: requestBody };
    },

    async poll(job, pollOptions = {}) {
      const maxAttempts = pollOptions.maxAttempts ?? 60;
      const initialDelayMs = pollOptions.initialDelayMs ?? 5000;
      const maxDelayMs = pollOptions.maxDelayMs ?? 30000;
      let status = job;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (status.status === 'completed') return status;
        if (TERMINAL_FAILURES.has(status.status)) {
          throw new Error(status.error || `OpenRouter video job ${status.status}`);
        }
        if (!status.polling_url) throw new Error('OpenRouter video job did not include polling_url');
        await sleep(Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs));
        const pollingUrl = new URL(status.polling_url, baseUrl);
        const response = await fetchImpl(pollingUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!response.ok) throw new Error(`OpenRouter polling failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
        status = await response.json();
        pollOptions.onStatus?.(status);
      }
      throw new Error(`OpenRouter video job did not complete after ${maxAttempts} polls`);
    },

    async download(job, outputPath) {
      const remoteUrl = job.unsigned_urls?.[0] || `${baseUrl}/videos/${encodeURIComponent(job.id)}/content?index=0`;
      const response = await fetchImpl(remoteUrl, {
        headers: remoteUrl.startsWith(baseUrl) ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
      if (!response.ok) throw new Error(`OpenRouter video download failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
      const target = resolve(outputPath);
      await mkdir(basename(target) === target ? '.' : target.slice(0, target.lastIndexOf('/')), { recursive: true });
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
      return target;
    },

    async generate(videoOptions, outputPath, pollOptions = {}) {
      const job = await this.submit(videoOptions);
      const completed = await this.poll(job, pollOptions);
      const filePath = await this.download(completed, outputPath);
      return { job: completed, filePath, request: job.request, apiKey: redact(apiKey) };
    },
  };
}