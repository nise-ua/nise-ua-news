#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVeoClient, createVeoRequest } from './veo-openrouter.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const promptIndex = args.indexOf('--prompt');
const prompt = promptIndex >= 0 ? args[promptIndex + 1] : 'Vertical cinematic Ukrainian news studio, neutral presenter voice speaking Ukrainian about today’s top news, no captions, no readable text, clean center-safe composition.';
const dryRun = args.includes('--dry-run');
const duration = Number(args[args.indexOf('--duration') + 1]) || 4;
const resolution = args.includes('--1080p') ? '1080p' : args.includes('--480p') ? '480p' : '720p';
const request = createVeoRequest({ prompt, model: process.env.VEO_MODEL || 'x-ai/grok-imagine-video-1.5', duration, resolution, aspectRatio: '9:16' });

console.log(JSON.stringify({ dryRun, request }, null, 2));
if (dryRun) process.exit(0);

const outputDir = join(root, 'output');
await mkdir(outputDir, { recursive: true });
const outputPath = join(outputDir, `grok-v2-smoke-${Date.now()}.mp4`);
const client = createVeoClient();
const result = await client.generate(request, outputPath, {
  onStatus: status => console.log(`[veo-v2] status=${status.status || 'unknown'}`),
});
console.log(`[veo-v2] saved: ${result.filePath}`);