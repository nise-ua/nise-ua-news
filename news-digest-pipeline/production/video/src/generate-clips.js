#!/usr/bin/env node

/**
 * Video Pipeline — Clip Generator
 *
 * Takes storyboard shots → generates animated video clips for each shot (using fal.ai, OpenAI, or Sharp + FFmpeg).
 *
 * Frames are rendered natively at 9:16 (1080x1920):
 *  - The AI background image is used as a full-bleed cover fill (NO letterbox bars).
 *  - The headline and optional detail are overlaid over a subtle gradient,
 *    matching the established 08-05 reel style (no card/plashka and no
 *    category label); text can be positioned upper or lower to avoid the
 *    background focal object.
 *  - Clips are intentionally static — no zoom/pan — so the headline stays fully visible.
 *
 * Text layout (createReelsOverlay):
 *  - NiSeNews branding + dot-grid sit flush at the very top of the frame.
 *  - News text (headline + second-sentence detail) is pushed higher than before
 *    so it clears the image's main focal objects, while staying in the safe zone.
 *  - Headline font enlarged for reel-screen readability; detail ("second
 *    sentence") font enlarged by the same relative step.
 */

import sharp from 'sharp';
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';

import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { fal } from '@fal-ai/client';
import { config as dotenvConfig } from 'dotenv';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = ffmpegStatic || 'ffmpeg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
dotenvConfig({ path: join(ROOT, '.env'), override: true });
// Simple in-memory cache to ensure one background image per news article
if (!globalThis.__imageCache) {
  globalThis.__imageCache = {};
}
if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function escapeXml(str) {
  return str.replace(/&/g, String.fromCharCode(38) + 'amp;')
            .replace(/</g, String.fromCharCode(38) + 'lt;')
            .replace(/>/g, String.fromCharCode(38) + 'gt;')
            .replace(/"/g, String.fromCharCode(38) + 'quot;')
            .replace(/'/g, String.fromCharCode(38) + 'apos;');
}

function splitHeadline(text, maxChars = 18) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current += (current ? ' ' : '') + w;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

/** Wrap a headline into readable lines. */
function wrapHeadline(text, maxChars = 24, maxLines = 4) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current += (current ? ' ' : '') + w;
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, maxLines);
}

function sanitizeDetailText(text) {
  let s = String(text || '').trim();
  if (!s) return '';
  // Extract ONLY the FIRST complete sentence if multiple exist
  const sentences = s.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  if (sentences.length > 0) {
    s = sentences[0];
  }
  // Ensure it ends cleanly with punctuation
  if (!/[.!?]$/.test(s)) {
    s = `${s.replace(/[,:;—-]+$/, '')}.`;
  }
  return s;
}

function wrapText(text, maxChars = 40, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, maxLines);
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
    return Buffer.from(await res.arrayBuffer());
  }
  if (existsSync(urlOrDataUri)) {
    return readFileSync(urlOrDataUri);
  }
  return Buffer.from(urlOrDataUri, 'base64');
}

/**
 * Build the native 9:16 full-frame image (1080x1920) with the headline overlay.
 *
 * Font sizes are enlarged for high readability in FB / IG Reels without overcrowding:
 *  - Headline: 56px font size (900 weight), 70px line height.
 *  - Detail Text: 36px font size (500 weight), 46px line height (strictly 1 short complete sentence).
 */

function createReelsOverlay(headline, detailText = '', textPosition = 'lower', width = 1080, height = 1920) {
  const margin = 80;

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  // Preserve the image while adding contrast only where the text lives.
  svg += `<defs><linearGradient id="reelBottomGradient" x1="0" y1="1" x2="0" y2="0">`;
  svg += `<stop offset="0%" stop-color="black" stop-opacity="0.82"/>`;
  svg += `<stop offset="50%" stop-color="black" stop-opacity="0.35"/>`;
  svg += `<stop offset="100%" stop-color="black" stop-opacity="0"/>`;
  svg += `</linearGradient></defs>`;
  const gradientY = textPosition === 'upper' ? 150 : Math.round(height * 0.44);
  svg += `<rect x="0" y="${gradientY}" width="${width}" height="${height - gradientY}" fill="url(#reelBottomGradient)"/>`;

  // Brand — top LEFT, flushed at the very top of the reel frame (enlarged)
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;

  // Dots — top RIGHT, enlarged and spread across the upper band
  const dotsX = width - margin - 150;
  const dotsY = margin + 15;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      svg += `<circle cx="${dotsX + col * 22}" cy="${dotsY + row * 22}" r="5" fill="white" opacity="0.8" />`;
    }
  }

  const hx = margin;

  const lines = wrapText(headline, 24, 4);
  const cleanDetail = sanitizeDetailText(detailText);
  const detailLines = wrapText(cleanDetail, 40, 3);

  const headlineFontSize = 56;
  const headlineLineHeight = 70;
  const detailFontSize = 36;
  const detailLineHeight = 46;
  const gapBetween = 20;

  const headlineTotalHeight = lines.length > 0 ? (lines.length - 1) * headlineLineHeight + headlineFontSize : 0;
  const detailTotalHeight = detailLines.length > 0 ? (detailLines.length - 1) * detailLineHeight + detailFontSize : 0;

  let hy;
  if (textPosition === 'upper') {
    // Moved up to occupy the top 25% of the 1920px frame (top 480px) so the
    // news text sits well below the top branding and clear of the image's
    // main focal objects near the upper third of the image.
    hy = 380;

  } else {
    // Target bottom Y moved higher (was height - 360) so the lower text block
    // clears the image's main objects while staying above FB/IG Reels action buttons.
    const targetBottomY = height - 500;
    const totalBlockHeight = headlineTotalHeight + (detailLines.length > 0 ? gapBetween + detailTotalHeight : 0);
    hy = targetBottomY - totalBlockHeight + headlineFontSize;
  }


  lines.forEach(line => {
    svg += `<text x="${hx}" y="${hy}" fill="white" font-family="Arial, sans-serif" font-size="${headlineFontSize}" font-weight="900" stroke="black" stroke-opacity="0.35" stroke-width="3" paint-order="stroke">${escapeXml(line)}</text>`;
    hy += headlineLineHeight;
  });

  if (detailLines.length > 0) {
    hy += (gapBetween - headlineLineHeight + detailFontSize);
    detailLines.forEach(line => {
      svg += `<text x="${hx}" y="${hy}" fill="white" font-family="Arial, sans-serif" font-size="${detailFontSize}" font-weight="500" opacity="0.95" stroke="black" stroke-opacity="0.30" stroke-width="2" paint-order="stroke">${escapeXml(line)}</text>`;
      hy += detailLineHeight;
    });
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Build the 9:16 frame (1080x1920) for a shot:
 *  - Background image is cover-filled to completely fill the Reel canvas
 *    (no letterbox bars or padding on any side).
 *  - Headline overlay positioned for both full-screen Reels AND Facebook feed
 *    center-crops (1:1 / 4:5).
 */
async function createShotImage(imageUrl, headline, detailText = '', textPosition = 'lower', width = 1080, height = 1920, overlay = true) {
  let bgBuffer = null;

  // The AI generated image is the text-free background of the news frame.
  if (imageUrl) {
    if (globalThis.__imageCache[imageUrl]) {
      bgBuffer = globalThis.__imageCache[imageUrl];
    } else {
      bgBuffer = await fetchImageBuffer(imageUrl);
      if (bgBuffer) globalThis.__imageCache[imageUrl] = bgBuffer;
    }
  }

  let base;
  if (bgBuffer) {
    try {
      // Cover-fill the entire 9:16 frame: the image is resized so the shorter
      // dimension matches the target, cropping the excess on the other axis.
      // This guarantees the canvas is completely covered with no black bars
      // or letterboxing, regardless of the source image aspect ratio.
      base = await sharp(bgBuffer)
        .resize(width, height, { fit: 'cover' })
        .png()
        .toBuffer();
    } catch (err) {
      log(`  Warning: could not prepare image frame: ${err.message}`);
      base = await sharp(bgBuffer).resize(width, height, { fit: 'cover' }).png().toBuffer();
    }
  } else {
    base = await sharp(Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#0f172a"/></svg>`)).png().toBuffer();
  }

  // Overlay the headline, branding, and optional detail on top of the image.
  // Opt-in (`overlay` flag): only applied when the caller explicitly wants it.
  // Carousel images from the image pipeline already contain the complete
  // NiSeNews/text design baked in — overlaying again would duplicate the text.
  // AI-generated text-free backgrounds should pass overlay=true.
  if (overlay && headline && headline.length > 0) {
    const overlaySvg = createReelsOverlay(headline, detailText, textPosition, width, height);
    base = await sharp(base)
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .png()
      .toBuffer();
  }

  return base;
}

export async function generateShotClip(shot, tempDir) {
  const duration = shot.duration || 5;
  const clipPath = join(tempDir, `shot_${shot.shot}_${Date.now()}.mp4`);

  log(`Generating clip for shot ${shot.shot}: "${shot.headline}" (${duration.toFixed(2)}s)...`);

  // Create the native 9:16 frame: full-bleed background + positioned text overlay.
  // `shot.overlay` defaults to true (AI backgrounds need the headline); set it
  // to false for carousel images that already contain their own design/text.
  const imgBuffer = await createShotImage(shot.imageUrl, shot.headline, shot.detailText, shot.textPosition, 1080, 1920, shot.overlay !== false);
  const imgPath = join(tempDir, `shot_${shot.shot}_bg.png`);
  writeFileSync(imgPath, imgBuffer);

  const fps = 30;
  // Keep the image completely static (no zoompan). The background is a full
  // 9:16 frame and the headline sits in the safe zone, so zooming is neither
  // needed nor desirable — it would only hide text behind the FB/IG UI.
  // Add a silent audio track so downstream concat/mix always has [0:a].
  const cmd = `"${FFMPEG}" -y -loop 1 -framerate ${fps} -i "${imgPath}" -f lavfi -i anullsrc=r=48000:cl=stereo -c:v libx264 -c:a aac -t ${duration} -pix_fmt yuv420p -movflags +faststart "${clipPath}"`;

  execSync(cmd, { stdio: 'pipe' });
  unlinkSync(imgPath);

  log(`  ✅ Motion clip generated: ${clipPath}`);
  return clipPath;
}
