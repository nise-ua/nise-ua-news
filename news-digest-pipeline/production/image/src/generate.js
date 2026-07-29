#!/usr/bin/env node

/**
 * Image Production Pipeline
 *
 * Digest → Claude (3 headlines + 3 prompts) → fal.ai Recraft V3 (3 images)
 *        → Claude Vision (pick best) → Sharp (overlay text) → final image
 *
 * Usage:
 *   node production/image/src/generate.js latest
 *   node production/image/src/generate.js <digest-id>
 */

import Anthropic from '@anthropic-ai/sdk';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
dotenvConfig({ path: join(ROOT, '.env'), override: true });

const SERVER = 'https://YOUR_DOMAIN';
const OUTPUT_DIR = join(__dirname, '..', 'output');

// --- Config ---

fal.config({ credentials: process.env.FAL_KEY });
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Step 1: Get digest content ---

async function getDigestContent(digestId) {
  const url = digestId === 'latest'
    ? `${SERVER}/api/digests/latest/text`
    : `${SERVER}/api/digests/${digestId}/text`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to get digest: ${res.status}`);
  return await res.text();
}

// --- Step 2: Generate headlines + image prompts via Claude ---

async function generateHeadlinesAndPrompts(digestText) {
  log('Generating headlines and image prompts via Claude...');

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Ти створюєш клікбейтні зображення для Instagram-дайджесту новин.

На основі цього дайджесту створи 3 варіанти:

Для кожного варіанту:
1. **headline** — клікбейтний заголовок українською (5-8 слів, максимум 2 рядки). Має викликати цікавість, бути провокаційним, але не брехливим. З конкретикою (цифри, імена, факти).
2. **prompt** — промпт для генерації фонового зображення (англійською, 1-2 речення).

НАЙВАЖЛИВІШІ ПРАВИЛА для промпта:
- Промпт МАЄ починатися зі слів: "Abstract blurred background with soft bokeh circles and smooth color gradients."
- Далі опиши ТІЛЬКИ кольори та настрій: "Deep blue and purple tones" або "Warm golden and orange hues" тощо.
- ЗАБОРОНЕНО згадувати: будь-які об'єкти, предмети, будівлі, природу, людей, техніку, текст, літери, цифри
- Промпт має описувати ТІЛЬКИ: кольори, градієнти, боке, розмиття, світло, тіні, настрій
- Закінчуй промпт: "Very dark, mostly black with subtle color bleed. No objects, no text."

Приклад хорошого промпта: "Abstract blurred background with soft bokeh circles and smooth color gradients. Deep blue and teal tones fading into black. Subtle glowing orbs scattered across dark space. Very dark, mostly black with subtle color bleed. No objects, no text."

Приклади хороших заголовків:
- "ШІ звільнив 80% відділу. Бос не шкодує."
- "Stack Overflow мертвий. Що далі?"
- "Anthropic: код напише себе сам"
- "HR більше не потрібен. IBM довела."

Відповідай СТРОГО в JSON форматі:
{
  "variants": [
    {"headline": "...", "prompt": "..."},
    {"headline": "...", "prompt": "..."},
    {"headline": "...", "prompt": "..."}
  ]
}

Дайджест:
${digestText.slice(0, 3000)}`,
    }],
  });

  const text = response.content[0].text;
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse Claude response as JSON');
  return JSON.parse(jsonMatch[0]);
}

// --- Step 3: Generate background images via fal.ai ---

async function generateBackgroundImages(variants) {
  log(`Generating ${variants.length} background images via Recraft V3...`);

  const results = await Promise.all(
    variants.map(async (v, i) => {
      log(`  Image ${i + 1}: "${v.prompt.slice(0, 60)}..."`);
      try {
        const result = await fal.subscribe('fal-ai/flux/dev', {
          input: {
            prompt: v.prompt,
            image_size: { width: 1080, height: 1350 },
            num_inference_steps: 28,
            guidance_scale: 3.5,
          },
        });
        const imageUrl = result.data.images[0].url;
        log(`  Image ${i + 1}: ✅ ${imageUrl.slice(0, 60)}...`);
        return { ...v, imageUrl, index: i };
      } catch (err) {
        log(`  Image ${i + 1}: ❌ ${err.message}`);
        return { ...v, imageUrl: null, index: i };
      }
    })
  );

  return results.filter(r => r.imageUrl);
}

// --- Step 4: Pick best image+headline via Claude Vision ---

async function pickBestVariant(variants) {
  if (variants.length === 1) return variants[0];

  log('Selecting best variant via Claude Vision...');

  // Download images for vision analysis
  const imageContents = await Promise.all(
    variants.map(async (v) => {
      const res = await fetch(v.imageUrl);
      const buffer = await res.arrayBuffer();
      const b64 = Buffer.from(buffer).toString('base64');
      // Detect media type from magic bytes
      const header = Buffer.from(buffer).slice(0, 4);
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

  const messages = [{
    role: 'user',
    content: [
      {
        type: 'text',
        text: `Ти обираєш найкраще зображення для Instagram-поста.

Ось ${imageContents.length} варіанти фонових зображень із заголовками:

${imageContents.map((v, i) => `Варіант ${i + 1}: Заголовок: "${v.headline}"`).join('\n')}

Критерії:
1. Фон має бути достатньо темним/контрастним, щоб білий текст був читабельним
2. Фон не має відволікати від тексту
3. Заголовок має чіпляти і викликати бажання прочитати
4. Загальне враження — професійний новинний канал

Відповідай ТІЛЬКИ номером найкращого варіанту (1, 2 або 3):`,
      },
      ...imageContents.map((v, i) => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: v.mediaType,
          data: v.base64,
        },
      })),
    ],
  }];

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 10,
    messages,
  });

  const pick = parseInt(response.content[0].text.trim()) - 1;
  const selected = pick >= 0 && pick < variants.length ? pick : 0;
  log(`Selected variant ${selected + 1}: "${variants[selected].headline}"`);
  return variants[selected];
}

// --- Step 5: Overlay text on image ---

async function overlayText(imageUrl, headline) {
  log('Downloading image and overlaying text...');

  // Download image
  const res = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await res.arrayBuffer());

  // Clean headline and prepare text SVG overlay
  const cleanHeadline = headline.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // First try splitting at sentence boundaries (periods)
  const sentences = cleanHeadline.split(/(?<=\.)\s+/).filter(s => s.trim());
  let lines;
  if (sentences.length >= 2 && sentences.every(s => s.length <= 25)) {
    // Each sentence fits on 1-2 lines — split by sentence first
    lines = [];
    for (const s of sentences) {
      const subLines = splitHeadline(s, 18);
      lines.push(...subLines);
    }
  } else {
    lines = splitHeadline(cleanHeadline, 18);
  }
  const fontSize = 84;
  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  const yStart = (1350 - totalTextHeight) / 2; // center vertically

  const textSvg = `
    <svg width="1080" height="1350">
      <defs>
        <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="black" flood-opacity="0.7"/>
        </filter>
      </defs>
      <!-- Semi-transparent overlay for readability -->
      <rect width="1080" height="1350" fill="black" opacity="0.35"/>
      ${lines.map((line, i) => `
        <text
          x="540" y="${yStart + i * lineHeight + fontSize}"
          text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}"
          font-weight="900"
          fill="white"
          filter="url(#shadow)"
        >${escapeXml(line)}</text>
      `).join('')}
    </svg>
  `;

  // Composite
  const result = await sharp(imageBuffer)
    .resize(1080, 1350, { fit: 'cover' })
    .composite([{
      input: Buffer.from(textSvg),
      top: 0,
      left: 0,
    }])
    .png()
    .toBuffer();

  return result;
}

function splitHeadline(text, maxChars) {
  // Keep units with their numbers: "$160 млн", "80%", "725 млрд"
  const units = ['млн', 'млрд', 'тис', '%', 'років', 'днів', 'годин'];
  let processed = text;
  for (const u of units) {
    // Replace "число unit" with "число\u00A0unit" (non-breaking space)
    processed = processed.replace(new RegExp(`(\\d+)\\s+(${u})`, 'gi'), '$1\u00A0$2');
  }
  // Keep $ directly attached to number (no space)
  processed = processed.replace(/\$\s+(\d)/g, '\$$$1');

  const words = processed.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const displayLen = word.replace(/\u00A0/g, ' ').length;
    const currentLen = current.replace(/\u00A0/g, ' ').length;
    if (currentLen + displayLen + 1 > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current) lines.push(current.trim());

  // Replace non-breaking spaces back for display
  return lines.map(l => l.replace(/\u00A0/g, ' '));
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const digestId = args[0] || 'latest';

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 1: Get digest
  log(`Fetching digest: ${digestId}`);
  const digestText = await getDigestContent(digestId);
  log(`Digest: ${digestText.length} chars`);

  // Step 2: Generate headlines + prompts
  const { variants } = await generateHeadlinesAndPrompts(digestText);
  log(`Generated ${variants.length} variants:`);
  variants.forEach((v, i) => log(`  ${i + 1}. "${v.headline}"`));

  // Step 3: Generate background images
  const withImages = await generateBackgroundImages(variants);
  if (withImages.length === 0) throw new Error('All image generations failed');

  // Step 4: Pick best
  const best = await pickBestVariant(withImages);

  // Step 5: Overlay text
  const finalImage = await overlayText(best.imageUrl, best.headline);

  // Save
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const filename = `instagram_${timestamp}.png`;
  const filepath = join(OUTPUT_DIR, filename);
  writeFileSync(filepath, finalImage);

  log(`✅ Final image saved: ${filepath}`);
  log(`   Headline: "${best.headline}"`);
  log(`   Size: ${finalImage.length} bytes`);

  return filepath;
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
