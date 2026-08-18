/**
 * Fetch grounded AI 9:16 stills for HTML-reel hybrid frames.
 * Lives only under html-reel/; does not modify the AI reel CLI.
 */

import OpenAI from 'openai';
import { fal } from '@fal-ai/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { groundVisualVariant } from '../../lib/visual-grounding.js';
import {
  generateImage,
  generateImageWithRetry,
  resolveImageVendor,
  safeLogUrl,
  sleep,
} from '../../lib/image-backends.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init' });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'dummy-key-for-init');
if (process.env.FAL_KEY) fal.config({ credentials: process.env.FAL_KEY });

/**
 * Generate one text-free 9:16 background per shot (same vendors as the AI reel path).
 * Returns shots with `backgroundImage` set to a URL or data URI, or [] on partial failure.
 */
export async function generateAiBackgroundsForShots(shots, { log = () => {} } = {}) {
  const vendor = resolveImageVendor();
  log(`Generating ${shots.length} AI 9:16 scene backgrounds via ${vendor} (HTML hybrid)...`);
  const failures = [];
  const results = [];
  const requestDelayMs = Math.max(0, Number(process.env.IMAGE_REQUEST_DELAY_MS || 1500));
  const imageDeps = {
    aspect: '9:16',
    openai,
    fal,
    genAI,
    log,
    title: 'NiSeNews HTML reel hybrid',
    openRouterFallback: process.env.OPENROUTER_API_KEY
      ? (prompt) => generateImageWithRetry(
        () => generateImage(prompt, {
          vendor: 'openrouter',
          aspect: '9:16',
          model: 'google/gemini-2.5-flash-image',
          title: 'NiSeNews HTML reel hybrid',
          log,
        }),
        { log, label: 'Image google-fallback' },
      )
      : null,
    openaiFallback: process.env.OPENAI_API_KEY
      ? (prompt) => generateImageWithRetry(
        () => generateImage(prompt, {
          vendor: 'openai',
          aspect: '9:16',
          openai,
          model: 'gpt-image-1',
          log,
        }),
        { log, label: 'Image openai-fallback' },
      )
      : null,
  };

  for (let i = 0; i < shots.length; i += 1) {
    const shot = groundVisualVariant(shots[i], i);
    const imagePrompt = shot.prompt;
    log(`  AI bg ${i + 1}: "${(imagePrompt || '').slice(0, 60)}..."`);
    try {
      let backgroundImage;
      if (vendor === 'openrouter') {
        backgroundImage = await generateImageWithRetry(
          () => generateImage(imagePrompt, {
            ...imageDeps,
            vendor: 'openrouter',
            model: process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro',
          }),
          { log, label: `AI bg ${i + 1}` },
        );
      } else {
        backgroundImage = await generateImage(imagePrompt, { ...imageDeps, vendor });
      }
      results.push({ ...shot, backgroundImage });
      log(`  AI bg ${i + 1}: OK ${safeLogUrl(backgroundImage)}`);
    } catch (err) {
      log(`  AI bg ${i + 1}: ERROR ${err.message}`);
      failures.push(`shot ${i + 1}: ${err.message}`);
      results.push({ ...shot, backgroundImage: null });
    }
    if (vendor === 'openrouter' && i < shots.length - 1 && requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }
  }

  const ok = results.filter((r) => r.backgroundImage);
  log(`${ok.length}/${shots.length} AI scene backgrounds ready for HTML composite.`);
  if (failures.length > 0) {
    log(`AI bg failures: ${failures.slice(0, 3).join(' | ')}${failures.length > 3 ? ' | ...' : ''}`);
  }
  if (ok.length !== shots.length) {
    throw new Error(
      `AI scene backgrounds failed (${ok.length}/${shots.length}). ${failures[0] || 'Fix IMAGE_VENDOR keys/quota.'}`,
    );
  }
  return results;
}
