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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import { applyTemplateOverlay } from './overlay.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const SERVER = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
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

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Normalize model aliases from the shared model catalog to OpenAI Images API
// model IDs. The API does not accept provider prefixes and does not expose a
// gpt-image-1-mini model; mapping the alias prevents all image jobs failing.
function resolveImageModel(configuredModel) {
  let model = String(configuredModel || 'dall-e-3').trim();
  if (model.includes('/')) model = model.split('/').pop();
  return model === 'gpt-image-1-mini' ? 'gpt-image-1' : model;
}

function imageSizeForModel(model) {
  if (model === 'dall-e-3') return '1024x1792';
  if (model === 'gpt-image-1') return '1024x1536';
  return '1024x1024';
}

async function generateOpenRouterImage(prompt, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing in .env');
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(process.env.BASE_URL ? { 'HTTP-Referer': process.env.BASE_URL } : {}),
      'X-Title': 'NiSeNews image pipeline',
    },
    body: JSON.stringify({ model, prompt, n: 1, resolution: '2K', aspect_ratio: '4:5', output_format: 'png' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter image request failed (${response.status})`);
  const item = payload?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:${item.media_type || 'image/png'};base64,${item.b64_json}`;
  throw new Error('OpenRouter response did not contain an image payload');
}

// --- Google Gemini Image Generation ---
/**
 * Generate an image using Google Gemini (Gemini 1.5 models).
 * Returns a data URI (base64) or a URL string.
 */
async function generateGoogleImage(prompt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY missing in .env');

  const modelName = process.env.GOOGLE_MODEL && process.env.GOOGLE_MODEL.includes('imagen')
    ? process.env.GOOGLE_MODEL
    : 'imagen-3.0-generate-002';

  // 1. Try Google Imagen 3 REST API endpoint (:predict)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '9:16' }
      })
    });
    if (res.ok) {
      const data = await res.json();
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
      if (b64) return `data:image/png;base64,${b64}`;
    } else {
      const errText = await res.text();
      log(`  Google Imagen REST API returned ${res.status}: ${errText.slice(0, 150)}`);
    }
  } catch (err) {
    log(`  Google Imagen REST fetch error: ${err.message}`);
  }

  // 2. Try Google Imagen 3 Fast variant endpoint
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-fast-generate-001:predict?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '9:16' }
      })
    });
    if (res.ok) {
      const data = await res.json();
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
      if (b64) return `data:image/png;base64,${b64}`;
    }
  } catch (err) {
    // Ignore
  }

  // 3. Try Google Gemini SDK generateContent if standard text/multimodal model
  try {
    const model = genAI.getGenerativeModel({ model: process.env.GOOGLE_MODEL || 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const candidates = result?.response?.candidates;
    if (candidates && candidates.length) {
      const part = candidates[0].content?.parts?.[0];
      if (part?.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
      if (part?.blob?.data) return `data:image/png;base64,${part.blob.data}`;
    }
    if (typeof result?.response?.text === 'function') {
      const txt = result.response.text().trim();
      if (txt.startsWith('http') || txt.startsWith('data:')) return txt;
    }
  } catch (err) {
    log(`  Gemini generateContent error: ${err.message}`);
  }

  // 4. Fallback to OpenRouter image model if OPENROUTER_API_KEY is available
  if (process.env.OPENROUTER_API_KEY) {
    log('  Fallback: generating image via OpenRouter...');
    const url = await generateOpenRouterImage(prompt, process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro');
    if (url) return url;
  }

  throw new Error('Failed to obtain image from Google Gemini/Imagen');
}

// --- Step 1: Get digest content ---

async function getDigestContent(digestId) {
  // First, check if it's a direct file path
  if (digestId !== 'latest' && existsSync(digestId)) {
    log(`Reading digest directly from file: ${digestId}`);
    return readFileSync(digestId, 'utf-8');
  }

  try {
    const url = digestId === 'latest'
      ? `${SERVER}/api/digests/latest/text`
      : `${SERVER}/api/digests/${digestId}/text`;
    
    // Add API Key if present in .env
    const headers = {};
    if (process.env.API_KEY) {
      headers['X-API-Key'] = process.env.API_KEY;
    }

    log(`Fetching from API: ${url}`);
    const res = await fetch(url, { headers });
    if (res.ok) return await res.text();
    log(`API fetch failed with status: ${res.status}`);
  } catch (err) {
    log(`API connection failed: ${err.message}`);
  }

  // FALLBACK: Try to find digest files in the local output directory
  log('Attempting to read from local output/ directory...');
  const outputDir = join(ROOT, 'output');
  if (existsSync(outputDir)) {
    const files = readdirSync(outputDir).filter(f => f.startsWith('digest_') && f.endsWith('.txt'));
    if (files.length > 0) {
      // Sort to find the latest
      files.sort().reverse();
      const latestFile = files[0];
      log(`Found local digest file: ${latestFile}`);
      return readFileSync(join(outputDir, latestFile), 'utf-8');
    }
  }

  throw new Error('Could not get digest content from API or local files.');
}

// --- Step 1.5: Parse digest to extract articles with URLs ---

function parseDigestArticles(digestText) {
  // Digest format: numbered items with text followed by URL on next line
  const articles = [];
  const lines = digestText.split('\n');
  let currentArticle = { text: '', url: '' };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check if line starts with a number (1., 2., etc.)
    const numberMatch = line.match(/^(\d+)\.\s*(.*)/);
    if (numberMatch) {
      // Save previous article if exists
      if (currentArticle.text || currentArticle.url) {
        articles.push(currentArticle);
      }
      currentArticle = { text: numberMatch[2], url: '' };
    } else if (line.startsWith('http')) {
      // This is a URL
      currentArticle.url = line;
    } else {
      // Continue article text
      currentArticle.text += (currentArticle.text ? ' ' : '') + line;
    }
  }
  
  // Don't forget the last article
  if (currentArticle.text || currentArticle.url) {
    articles.push(currentArticle);
  }
  
  return articles;
}

// --- Step 2: Generate headlines + image prompts via AI (Anthropic, OpenAI or Google) ---

async function generateHeadlinesAndPrompts(digestText) {
  const vendor = process.env.LLM_VENDOR || (process.env.OPENAI_API_KEY ? 'openai' : (process.env.GOOGLE_API_KEY ? 'google' : 'anthropic'));
  log(`Generating headlines and image prompts via ${vendor}...`);

  // First parse articles with URLs
  const articles = parseDigestArticles(digestText);
  log(`Parsed ${articles.length} articles from digest`);

  const systemPrompt = `Ти створюєш клікбейтні зображення для Instagram/дописів для українського медіа.

На основі цього дайджесту виділи КОЖНУ окрему новину/статтю (зазвичай 3-7 новин).

Для КОЖНОЇ новини створи:
1. **headline** — заголовок українською (5-8 слів, максимум 2 рядки). Має викликати цікавість, емоції, але не брехливим. З конкретикою (цифри, імена, місця).
2. **prompt** — промпт для генерації фонового зображення (АНГЛІЙСЬКОЮ, 1-2 речення).
3. **url** — URL джерела новини.

НАЙВАЖЛИВІШІ ПРАВИЛА для промпту:
- Промпт МАЄ описувати ВІЗУАЛЬНУ метафору новини, а не абстрактний фон
- Використовуй символи, об'єкти, сцени, які асоціюються з темою новини
- КРИТИЧНО ВАЖЛИВО: Зображення НЕ МАЄ містити жодного тексту, літер, цифр, слів, логотипів, написів — НІЯКОГО ТЕКСТУ ВОВНЕ!
- Стиль: кінематографічний, неоновий/кіберпанк для технологій, мрачний для небезпеки, епічний для глобальних тем
- Фон має бути достатньо темним для белого тексту поверх
- Закінчуй промпт: "No text, no letters, no numbers, no words, no logos. Dark moody atmosphere, high contrast for white text overlay. Cinematic lighting, 1080x1350."

Приклад хорошого промпту для AI музики: "Futuristic recording studio with AI neural network visualizing music as glowing particle waves, synthesizer keyboards floating, dark purple and blue cinematic lighting, high detail. No text, no letters, no numbers, no words, no logos. Dark moody atmosphere, high contrast for white text overlay."

Приклад для OpenAI про автора: "Classic typewriter with AI neural threads typing by itself, ghostly author silhouette fading away, warm sepia and cold blue contrast, dramatic lighting. No text, no letters, no numbers, no words, no logos. Dark moody atmosphere, high contrast for white text overlay."

Приклад для кібербезпеки: "Shattered digital shield with binary code and passwords leaking out like water, hacker hoodie silhouette in background, dark cyan and red alert lighting. No text, no letters, no numbers, no words, no logos. Dark moody atmosphere, high contrast for white text overlay."

Приклад для дата-центрів: "Massive data center cooling towers merging with suburban neighborhood, angry residents with protest signs (no text on signs), power lines dominating sky, golden hour dramatic lighting. No text, no letters, no numbers, no words, no logos. Dark moody atmosphere, high contrast for white text overlay."

Приклад Китай vs США: "Two giant AI dragons (red Chinese, blue American) battling in digital clouds over globe, neural network patterns, epic scale, dramatic lightning. No text, no letters, no numbers, no words, no logos. Dark moody atmosphere, high contrast for white text overlay."

Відповідай в JSON форматі (один об'єкт "variants" з елементами для КОЖНОЇ новини):
{
  "variants": [
    {"headline": "...", "prompt": "...", "url": "..."},
    {"headline": "...", "prompt": "...", "url": "..."}
  ]
}`;

  const userPrompt = `Дайджест:\n${digestText.slice(0, 4000)}`;

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
  
  // Merge URLs from parsed articles if AI didn't include them
  if (result.variants && articles.length > 0) {
    result.variants.forEach((v, i) => {
      if (!v.url && articles[i] && articles[i].url) {
        v.url = articles[i].url;
      }
    });
  }
  
  return result;
}

function safeLogUrl(url) {
  if (!url) return 'null';
  if (url.startsWith('data:')) {
    return `${url.slice(0, 40)}... [base64 data URI, length: ${url.length}]`;
  }
  return url.length > 80 ? `${url.slice(0, 80)}...` : url;
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
  // Normalize IMAGE_VENDOR (trim & lower) to avoid whitespace issues
  const rawVendor = (process.env.IMAGE_VENDOR || '').trim().toLowerCase();
  const vendor = rawVendor || (process.env.OPENAI_API_KEY ? 'dalle' : 'fal');
  log(`Image vendor resolved to '${vendor}'`);
  log(`Generating ${variants.length} background images via ${vendor}...`);

  const results = await Promise.all(
    variants.map(async (v, i) => {
      // Choose a random background style to add variety
      const styles = ["bright and colorful", "vibrant high‑contrast", "soft pastel tones", "cinematic lighting", "dark moody"];
      const style = styles[Math.floor(Math.random() * styles.length)];
      const promptWithStyle = `${style}, ${v.prompt}`;
      log(`  Image ${i + 1}: \"${promptWithStyle.slice(0, 60)}...\"`);
      try {
        let imageUrl;
        if (vendor === 'openrouter') {
          imageUrl = await generateOpenRouterImage(promptWithStyle, process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro');
        } else if (vendor === 'dalle' || vendor === 'openai') {
          if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing in .env');
          
          const model = resolveImageModel(process.env.DALLE_MODEL);
          const size = imageSizeForModel(model);
          
          log(`  Requesting OpenAI Image Gen (${model})....`);
          const response = await openai.images.generate({
            model: model,
            prompt: promptWithStyle,
            n: 1,
            size: size,
            quality: (model === "dall-e-3" || model === "gpt-image-3") ? "standard" : undefined,
          });
          
          if (response && response.data && response.data[0]) {
            const item = response.data[0];
            if (item.url) {
              imageUrl = item.url;
            } else if (item.b64_json) {
              imageUrl = `data:image/png;base64,${item.b64_json}`;
            }
          }
          if (!imageUrl) {
            throw new Error(`Invalid response structure from OpenAI: missing url and b64_json`);
          }
          log(`  OpenAI response: received data payload (${safeLogUrl(imageUrl)})`);
        } else if (vendor === 'google') {
          // Generate image via Google Gemini
          imageUrl = await generateGoogleImage(promptWithStyle);
          if (!imageUrl) throw new Error('Google Gemini image generation failed');
        } else {
          // Fallback to Fal AI
          if (!process.env.FAL_KEY) throw new Error('FAL_KEY missing in .env');
          const result = await fal.subscribe('fal-ai/flux/dev', {
            input: {
              prompt: promptWithStyle,
              image_size: { width: 1080, height: 1350 },
              num_inference_steps: 28,
              guidance_scale: 3.5,
            },
          });
          imageUrl = result.data.images[0].url;
        }
        log(`  Image ${i + 1}: ✅ ${safeLogUrl(imageUrl)}`);
        return { ...v, imageUrl, index: i };
      } catch (err) {
        log(`  Image ${i + 1}: ❌ Error type: ${err.constructor.name}`);
        log(`  Image ${i + 1}: ❌ Message: ${err.message}`);
        if (err.response) {
          log(`  Image ${i + 1}: ❌ Response Data: ${JSON.stringify(err.response.data).slice(0, 200)}`);
        }
        return { ...v, imageUrl: null, index: i };
      }
    })
  );

  return results.filter(r => r.imageUrl);
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
  const digestText = await getDigestContent(digestId);
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