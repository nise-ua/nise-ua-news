#!/usr/bin/env node

/**
 * Image Production Pipeline
 *
 * Digest → AI (Anthropic/OpenAI/Google) (3 headlines + 3 prompts) → AI Image (fal.ai/DALL-E) (3 images)
 *        → AI Vision (pick best) → Anthropic (overlay text) → final image
 *
 * Usage:
 *   node production/image/src/generate.js latest
 *   node production/image/src/generate.js <digest-id>
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { applyTemplateOverlay } from './overlay.js';
import { VISUAL_GROUNDING_RULES, groundVisualVariant, finalizeImagePrompt } from '../../lib/visual-grounding.js';
import { getDigestContent, parseDigestArticles } from '../../lib/digest.js';
import {
  generateImage,
  resolveImageVendor,
  safeLogUrl,
  sleep,
} from '../../lib/image-backends.js';
import { log, projectRoot, scriptDir } from '../../lib/logging.js';

const __dirname = scriptDir(import.meta.url);
const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: false });

const OUTPUT_DIR = join(__dirname, '..', 'output');

// --- Config ---

fal.config({ credentials: process.env.FAL_KEY });

const claude = new Anthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-init' 
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-init'
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'dummy-key-for-init');

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Step 1: Digest load + parse (shared production/lib/digest.js) ---

// --- Step 2: Generate headlines + image prompts via AI (Anthropic, OpenAI or Google) ---

async function generateHeadlinesAndPrompts(digestText) {
  const vendor = process.env.LLM_VENDOR || (process.env.OPENAI_API_KEY ? 'openai' : (process.env.GOOGLE_API_KEY ? 'google' : 'anthropic'));
  log(`Generating headlines and image prompts via ${vendor}...`);

  // First parse articles with URLs
  const articles = parseDigestArticles(digestText);
  log(`Parsed ${articles.length} articles from digest`);

  const systemPrompt = `Ти створюєш клікбейтні зображення для Instagram/дописів для українського медіа.

На вхід приходять ОКРЕМІ блоки новин. Для КОЖНОГО блоку створи поля:
1. **coreFact** — нейтральний факт англійською (хто/що/що сталося), БЕЗ сарказму автора
2. **entities** — масив конкретних назв (компанії, продукти, технології, місця)
3. **newsTone** — "positive" | "neutral" | "negative" (лише з coreFact, не з сарказму)
4. **visualSubject** — 1 конкретна сцена англійською з цих сутностей і дії
5. **headline** — заголовок українською (5-8 слів, макс 2 рядки). Конкретика (цифри, імена, продукти). Без саркастичних слів на кшталт «революція/історія», якщо це не буквальний факт
6. **prompt** — англійський промпт фону (1-2 речення), ОБОВ'ЯЗКОВО побудований з visualSubject
7. **url** — URL джерела (якщо є у блоці)

${VISUAL_GROUNDING_RULES}

Закінчуй prompt: no UI screenshots, no readable text on the image, lighting/colors matching newsTone, photorealistic news photography, 1080x1350.

Відповідай ТІЛЬКИ JSON:
{
  "variants": [
    {
      "coreFact": "...",
      "entities": ["...", "..."],
      "newsTone": "positive|neutral|negative",
      "visualSubject": "...",
      "headline": "...",
      "prompt": "...",
      "url": "..."
    }
  ]
}`;

  const articleBlocks = articles.length > 0
    ? articles.map((a, i) => `--- ARTICLE ${i + 1} ---\n${a.text}${a.url ? `\nURL: ${a.url}` : ''}`).join('\n\n')
    : digestText.slice(0, 4000);
  const userPrompt = `Опрацюй КОЖЕН блок окремо. Ігноруй авторський сарказм; візуал = факт новини.\n\n${articleBlocks}`;

  let text;
  if (vendor === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing in .env');
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });
    text = response.choices[0].message.content;
  } else if (vendor === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing in .env');
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(process.env.BASE_URL ? { 'HTTP-Referer': process.env.BASE_URL } : {}),
        'X-Title': 'NiSeNews image pipeline',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter chat request failed (${response.status})`);
    text = payload?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenRouter response did not contain text content');
  } else if (vendor === 'google') {
    if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY missing in .env');
    const textModel = (process.env.GOOGLE_MODEL && !process.env.GOOGLE_MODEL.includes('image'))
      ? process.env.GOOGLE_MODEL
      : 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({ 
      model: textModel,
      generationConfig: { responseMimeType: "application/json" }
    });
    const response = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    text = response.response.text();
  } else {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing in .env');
    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `${systemPrompt}\n\n${userPrompt}`,
      }],
    });
    text = response.content[0].text;
  }
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');
  const result = JSON.parse(jsonMatch[0]);
  
  // Merge URLs from parsed articles if AI didn't include them, then ground prompts
  if (result.variants && articles.length > 0) {
    result.variants.forEach((v, i) => {
      if (!v.url && articles[i] && articles[i].url) {
        v.url = articles[i].url;
      }
    });
  }

  result.variants = (result.variants || []).map((v, i) => {
    const grounded = groundVisualVariant(v, i);
    if (grounded.prompt !== v.prompt) {
      log(`  Variant ${i + 1}: rebuilt prompt from coreFact/entities (sarcasm/abstract rejected)`);
    }
    log(`  Variant ${i + 1} fact: ${(grounded.coreFact || '').slice(0, 80)}`);
    log(`  Variant ${i + 1} prompt: ${(grounded.prompt || '').slice(0, 100)}`);
    return grounded;
  });
  
  return result;
}

async function fetchImageBuffer(urlOrDataUri) {
  if (!urlOrDataUri) throw new Error('Image URL or data URI is empty');
  if (urlOrDataUri.startsWith('data:')) {
    const base64Data = urlOrDataUri.split(',')[1] || urlOrDataUri;
    return Buffer.from(base64Data, 'base64');
  }
  if (urlOrDataUri.startsWith('http://') || urlOrDataUri.startsWith('https://')) {
    const res = await fetch(urlOrDataUri);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${urlOrDataUri.slice(0, 60)}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    log(`Fetched image buffer from URL. Size: ${buffer.length}`);
    return buffer;
  }
  if (existsSync(urlOrDataUri)) {
    return readFileSync(urlOrDataUri);
  }
  
  // Last fallback: it might be base64 data without data uri prefix
  try {
    const buffer = Buffer.from(urlOrDataUri, 'base64');
    log(`Parsed base64 buffer. Size: ${buffer.length}`);
    return buffer;
  } catch (e) {
    throw new Error('Unsupported image format string');
  }
}

// --- Step 3: Generate background images via AI (DALL-E 3 or fal.ai) ---

async function generateBackgroundImages(variants) {
  const vendor = resolveImageVendor();
  log(`Image vendor resolved to '${vendor}'`);
  log(`Generating ${variants.length} background images via ${vendor} (sequential mode)...`);

  const results = [];
  const requestDelayMs = Math.max(0, Number(process.env.IMAGE_REQUEST_DELAY_MS || 2000));

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const promptWithStyle = finalizeImagePrompt(v.prompt, {
      newsTone: v.newsTone,
      coreFact: v.coreFact,
      index: i,
    });
    log(`  Image ${i + 1}: \"${promptWithStyle.slice(0, 60)}...\"`);

    const maxAttempts = Math.max(1, Number(process.env.IMAGE_MAX_RETRIES || 3) + 1);
    let imageUrl = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        imageUrl = await generateImage(promptWithStyle, {
          vendor,
          aspect: '4:5',
          openai,
          fal,
          genAI,
          log,
          title: 'NiSeNews image pipeline',
        });
        break;
      } catch (err) {
        lastErr = err;
        log(`  Image ${i + 1}: attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
        if (attempt < maxAttempts) {
          const delayMs = 2500 * attempt;
          log(`  Retrying image ${i + 1} in ${delayMs}ms...`);
          await sleep(delayMs);
        }
      }
    }

    if (imageUrl) {
      log(`  Image ${i + 1}: ✅ ${safeLogUrl(imageUrl)}`);
      results.push({ ...v, imageUrl, index: i });
    } else {
      log(`  Image ${i + 1}: ❌ Error type: ${lastErr?.constructor?.name || 'Error'}`);
      log(`  Image ${i + 1}: ❌ Message: ${lastErr?.message || 'unknown'}`);
      results.push({ ...v, imageUrl: null, index: i });
    }

    // Delay between requests to avoid rate limiting and concurrent issues
    if (i < variants.length - 1 && requestDelayMs > 0) {
      log(`  Waiting ${requestDelayMs}ms before next image...`);
      await sleep(requestDelayMs);
    }
  }

  const ok = results.filter(r => r.imageUrl);
  if (ok.length !== variants.length) {
    log(`Only ${ok.length}/${variants.length} images succeeded — refusing partial set.`);
    return [];
  }
  return ok;
}

// --- Step 4: Pick best image+headline via AI Vision (Anthropic, OpenAI or Google) ---

async function pickBestVariant(variants) {
  if (variants.length === 1) {
    log(`Only 1 variant exists. Returning it directly without Vision AI.`);
    return variants[0];
  }

  const vendor = process.env.LLM_VENDOR || (process.env.OPENAI_API_KEY ? 'openai' : (process.env.GOOGLE_API_KEY ? 'google' : 'anthropic'));
  log(`Selecting best variant via ${vendor} Vision for ${variants.length} variants...`);

  // Download/load images for vision analysis
  const imageContents = await Promise.all(
    variants.map(async (v, index) => {
      log(`Calling fetchImageBuffer in pickBestVariant for variant ${index}...`);
      const buffer = await fetchImageBuffer(v.imageUrl);
      log(`fetchImageBuffer for variant ${index} returned buffer of size: ${buffer.length}`);
      const b64 = buffer.toString('base64');
      // Detect media type from magic bytes
      const header = buffer.slice(0, 4);
      let mediaType = 'image/png';
      if (header[0] === 0xFF && header[1] === 0xD8) mediaType = 'image/jpeg';
      else if (header[0] === 0x89 && header[1] === 0x50) mediaType = 'image/png';
      else if (header.toString('ascii', 0, 4) === 'RIFF') mediaType = 'image/webp';

      return {
        ...v,
        base64: b64,
        mediaType,
      };
    })
  );

  const promptText = `Ти обираєш найкраще зображення для новин.

Ось ${imageContents.length} варіантів фонових зображень із заголовками:

${imageContents.map((v, i) => `Варіант ${i + 1}: [PERSON_NAME]: "${v.headline}"`).join('\n')}

Критерії:
1. Фон має бути достатньо темним/контрастним, щоб білий текст був читабельним
2. Фон має візуально відповідати темі (не абстрактний)
3. Заголовок має чіпляти і викликати бажання прочитати
4. Загальний вигляд — професійний для news канал

Відповідай ТІЛЬКИ номером найкращого варіанту (1, 2 або 3):`;

  let pick;

  if (vendor === 'openai') {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          ...imageContents.map(v => ({
            type: 'image_url',
            image_url: { url: `data:${v.mediaType};base64,${v.base64}` }
          }))
        ]
      }],
      max_tokens: 10
    });
    pick = parseInt(response.choices[0].message.content.trim()) - 1;
  } else if (vendor === 'google') {
    const model = genAI.getGenerativeModel({ model: process.env.GOOGLE_MODEL || "gemini-1.5-flash" });
    const parts = [
      { text: promptText },
      ...imageContents.map(v => ({
        inlineData: {
          mimeType: v.mediaType,
          data: v.base64
        }
      }))
    ];
    const response = await model.generateContent(parts);
    pick = parseInt(response.response.text().trim()) - 1;
  } else {
    const response = await claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          ...imageContents.map(v => ({
            type: 'image',
            source: { type: 'base64', media_type: v.mediaType, data: v.base64 }
          }))
        ]
      }]
    });
    pick = parseInt(response.content[0].text.trim()) - 1;
  }

  const selected = pick >= 0 && pick < variants.length ? pick : 0;
  log(`Selected variant ${selected + 1}: "${variants[selected].headline}"`);
  return variants[selected];
}

// --- Step 5: Overlay text on image ---

async function overlayText(imageUrl, headline, url, templateIndex = 1) {
  log(`Downloading image and overlaying text using Template ${templateIndex}...`);

  // Download/load image buffer safely
  const imageBuffer = await fetchImageBuffer(imageUrl);
  
  // Clean headline
  const cleanHeadline = headline.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Use Template layout (which we implemented in overlay.js)
  // Pass the actual article URL instead of placeholder
  const result = await applyTemplateOverlay(
    imageBuffer, 
    cleanHeadline, 
    [], // no bullets for now
    '@your_account', 
    url || 'https://news.example.com/digest/latest',
    templateIndex
  );

  return result;
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  // filter out -- args first, then get the first positional arg if any
  const positionalArgs = args.filter(a => !a.startsWith('--'));
  const digestId = positionalArgs.length > 0 ? positionalArgs[0] : 'latest';
  const isSingleMode = args.includes('--single');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: Get digest
  log(`Fetching digest: ${digestId}`);
  const digestText = await getDigestContent(digestId, { log });
  log(`Digest: ${digestText.length} chars`);

  // Step 2: Generate headlines + prompts
  const { variants } = await generateHeadlinesAndPrompts(digestText);
  log(`Generated ${variants.length} article variants:`);
  variants.forEach((v, i) => log(`  ${i + 1}. "${v.headline}" - ${v.url ? 'URL ✓' : 'URL ✗'}`));

  // Step 3: Generate background images
  const withImages = await generateBackgroundImages(variants);
  if (withImages.length === 0) {
    log('❌ All image generations failed. Possible reasons:');
    log('   1. Invalid FAL_KEY or API keys in .env');
    log('   2. Account balance is low');
    log('   3. Network issue or API timeout');
    throw new Error('All image generations failed');
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

  if (isSingleMode) {
    // Step 4: Pick best single variant
    try {
      const best = await pickBestVariant(withImages);
      // Pick a random template index from 1 to 8
      const randomTemplateIndex = Math.floor(Math.random() * 8) + 1;
      const finalImage = await overlayText(best.imageUrl, best.headline, best.url, randomTemplateIndex);
      const filename = `instagram_${timestamp}.png`;
      const filepath = join(OUTPUT_DIR, filename);
      writeFileSync(filepath, finalImage);

      log(`✅ Final single image saved: ${filepath}`);
      log(`   Headline: "${best.headline}"`);
      log(`   URL: ${best.url}`);
      log(`   Size: ${finalImage.length} bytes`);
      return [filepath];
    } catch (e) {
      log(`Error in single mode generation: ${e.stack}`);
      throw e;
    }
  } else {
    // Multi-image carousel mode (generate an image for each article in digest)
    log(`Generating images for all ${withImages.length} articles (carousel mode)...`);
    const savedFiles = [];

    for (let i = 0; i < withImages.length; i++) {
      const item = withImages[i];
      // Distribute 8 templates sequentially across multi-images or use i % 8 + 1
      const templateIndex = (i % 8) + 1;
      log(`  Overlaying text ${i + 1}/${withImages.length}: "${item.headline}" using Template ${templateIndex}`);
      const finalImage = await overlayText(item.imageUrl, item.headline, item.url, templateIndex);
      const filename = `instagram_${timestamp}_${String(i + 1).padStart(2, '0')}.png`;
      const filepath = join(OUTPUT_DIR, filename);
      writeFileSync(filepath, finalImage);
      savedFiles.push(filepath);
      log(`  ✅ Saved (${i + 1}/${withImages.length}): ${filepath} (${finalImage.length} bytes)`);
    }

    log(`\n🎉 Carousel generation complete! ${savedFiles.length} images created.`);
    return savedFiles;
  }
}

main().catch(err => {
  console.error(`Fatal Stack: ${err.stack}`);
  process.exit(1);
});