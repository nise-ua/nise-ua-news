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
 *  - News text (headline + detail) uses the storyboard position, normally the
 *    upper 25% safe zone, above the main visual subject.
 *  - Headline font enlarged for reel-screen readability; detail ("second
 *    sentence") font enlarged by the same relative step.
 */

import sharp from 'sharp';
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';

import { join, basename } from 'path';
import { fal } from '@fal-ai/client';
import { config as dotenvConfig } from 'dotenv';
import ffmpegStatic from 'ffmpeg-static';
import { getOverlayThemeColors, UPPER_READABILITY_BAND } from '../../lib/reel-overlay-theme.js';
import { layoutReelOverlayText } from '../../lib/reel-overlay-text.js';
import { log, projectRoot, scriptDir } from '../../lib/logging.js';

const FFMPEG = ffmpegStatic || 'ffmpeg';

const __dirname = scriptDir(import.meta.url);
const ROOT = projectRoot(import.meta.url);
dotenvConfig({ path: join(ROOT, '.env'), override: true });
// Simple in-memory cache to ensure one background image per news article
if (!globalThis.__imageCache) {
  globalThis.__imageCache = {};
}
if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

function escapeXml(str) {
  return str.replace(/&/g, String.fromCharCode(38) + 'amp;')
            .replace(/</g, String.fromCharCode(38) + 'lt;')
            .replace(/>/g, String.fromCharCode(38) + 'gt;')
            .replace(/"/g, String.fromCharCode(38) + 'quot;')
            .replace(/'/g, String.fromCharCode(38) + 'apos;');
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
 *  - Headline/detail start large, then shrink together so every word of the
 *    complete sentence stays on screen (no max-line slice).
 */

function createReelsOverlay(headline, detailText = '', textPosition = 'lower', width = 1080, height = 1920, overlayTheme = 'light') {
  const margin = 80;
  const safeTextPosition = textPosition === 'upper' ? 'upper' : 'lower';
  // Upper reel layout always uses the locked Google-Earth-style dark band + white text.
  const colors = getOverlayThemeColors(safeTextPosition === 'upper' ? 'light' : overlayTheme);

  const hx = margin;
  const layout = layoutReelOverlayText({
    headline,
    detailText,
    width,
    height,
    textPosition: safeTextPosition,
    margin,
  });
  const lines = layout.headlineLines;
  const detailLines = layout.detailLines;
  const headlineFontSize = layout.headlineFontSize;
  const headlineLineHeight = layout.headlineLineHeight;
  const detailFontSize = layout.detailFontSize;
  const detailLineHeight = layout.detailLineHeight;
  const detailFontWeight = colors.detailFontWeight || 800;
  const gapBetween = layout.gapBetween;
  let hy = layout.hy;

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  if (safeTextPosition === 'upper') {
    // Locked readability rectangle: solid dark panel over the top ~22%, then soft fade.
    const solidHeight = Math.round(height * UPPER_READABILITY_BAND.solidRatio);
    const fadeHeight = Math.round(height * UPPER_READABILITY_BAND.fadeRatio);
    svg += `<defs><linearGradient id="reelUpperBandFade" x1="0" y1="0" x2="0" y2="1">`;
    for (const [offset, stopColor, opacity] of UPPER_READABILITY_BAND.fadeStops) {
      svg += `<stop offset="${offset}" stop-color="${stopColor}" stop-opacity="${opacity}"/>`;
    }
    svg += `</linearGradient></defs>`;
    svg += `<rect x="0" y="0" width="${width}" height="${solidHeight}" fill="${UPPER_READABILITY_BAND.solidColor}" fill-opacity="${UPPER_READABILITY_BAND.solidOpacity}"/>`;
    svg += `<rect x="0" y="${solidHeight}" width="${width}" height="${fadeHeight}" fill="url(#reelUpperBandFade)"/>`;
  } else {
    const gradientId = 'reelBottomGradient';
    svg += `<defs><linearGradient id="${gradientId}" x1="0" y1="1" x2="0" y2="0">`;
    for (const [offset, stopColor, opacity] of colors.gradientStops) {
      svg += `<stop offset="${offset}" stop-color="${stopColor}" stop-opacity="${opacity}"/>`;
    }
    svg += `</linearGradient></defs>`;
    const gradientY = Math.round(height * 0.44);
    const gradientHeight = height - gradientY;
    svg += `<rect x="0" y="${gradientY}" width="${width}" height="${gradientHeight}" fill="url(#${gradientId})"/>`;
  }

  // Brand — top LEFT, flushed at the very top of the reel frame (enlarged)
  svg += `<text x="${margin}" y="${margin + 48}" fill="${colors.brandNiSeFill}" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="${colors.brandNewsFill}">News</tspan></text>`;

  // Dots — top RIGHT, enlarged and spread across the upper band
  const dotsX = width - margin - 150;
  const dotsY = margin + 15;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      svg += `<circle cx="${dotsX + col * 22}" cy="${dotsY + row * 22}" r="5" fill="${colors.dotsFill}" opacity="${colors.dotsOpacity}" />`;
    }
  }

  lines.forEach(line => {
    svg += `<text x="${hx}" y="${hy}" fill="${colors.headlineFill}" font-family="Arial, sans-serif" font-size="${headlineFontSize}" font-weight="900" stroke="${colors.headlineStroke}" stroke-opacity="${colors.headlineStrokeOpacity}" stroke-width="${colors.headlineStrokeWidth}" paint-order="stroke">${escapeXml(line)}</text>`;
    hy += headlineLineHeight;
  });

  if (detailLines.length > 0) {
    hy += (gapBetween - headlineLineHeight + detailFontSize);
    detailLines.forEach(line => {
      svg += `<text x="${hx}" y="${hy}" fill="${colors.detailFill}" font-family="Arial, sans-serif" font-size="${detailFontSize}" font-weight="${detailFontWeight}">${escapeXml(line)}</text>`;
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
export async function createShotImage(imageUrl, headline, detailText = '', textPosition = 'lower', width = 1080, height = 1920, overlay = true) {
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
  // Upper layout always uses the locked dark readability band + white text
  // (Google Earth style), independent of background brightness.
  if (overlay && headline && headline.length > 0) {
    if (textPosition === 'upper') {
      log('  Overlay: locked dark upper band + white text');
    }
    const overlaySvg = createReelsOverlay(headline, detailText, textPosition, width, height, 'light');
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
  const imgBuffer = await createShotImage(shot.imageUrl, shot.headline, shot.detailText, 'upper', 1080, 1920, shot.overlay !== false);
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
