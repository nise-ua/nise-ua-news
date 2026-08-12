import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  analyzeTextRegionBrightness,
  pickOverlayTheme,
  resolveOverlayTheme,
  getOverlayThemeColors,
  UPPER_READABILITY_BAND,
  BRIGHTNESS_THRESHOLD,
} from './reel-overlay-theme.js';

test('pickOverlayTheme switches to dark text on bright backgrounds', () => {
  assert.equal(pickOverlayTheme(BRIGHTNESS_THRESHOLD - 1), 'light');
  assert.equal(pickOverlayTheme(BRIGHTNESS_THRESHOLD), 'dark');
  assert.equal(pickOverlayTheme(220), 'dark');
});

test('dark theme uses matching headline and detail colors', () => {
  const colors = getOverlayThemeColors('dark');
  assert.equal(colors.headlineFill, '#0f172a');
  assert.equal(colors.detailFill, colors.headlineFill);
  assert.equal(colors.detailFontWeight, 900);
  assert.equal(colors.detailStrokeOpacity, 0);
});

test('light theme keeps white headline text', () => {
  const colors = getOverlayThemeColors('light');
  assert.equal(colors.headlineFill, '#ffffff');
  assert.equal(colors.detailFill, colors.headlineFill);
  assert.equal(colors.detailFontWeight, 900);
  assert.equal(colors.detailStrokeOpacity, 0);
  assert.match(colors.gradientStops[0][1], /black/i);
});

test('upper readability band covers about the top quarter', () => {
  assert.ok(UPPER_READABILITY_BAND.solidRatio >= 0.2);
  assert.ok(UPPER_READABILITY_BAND.solidRatio + UPPER_READABILITY_BAND.fadeRatio <= 0.35);
  assert.ok(UPPER_READABILITY_BAND.solidOpacity >= 0.7);
});

test('analyzeTextRegionBrightness detects bright upper band', async () => {
  const bright = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: { r: 240, g: 235, b: 220 },
    },
  }).png().toBuffer();

  const dark = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: { r: 20, g: 25, b: 40 },
    },
  }).png().toBuffer();

  const brightRegions = await analyzeTextRegionBrightness(bright);
  const darkRegions = await analyzeTextRegionBrightness(dark);
  assert.ok(brightRegions.textBlock > darkRegions.textBlock);
  assert.equal((await resolveOverlayTheme(bright)).theme, 'dark');
  assert.equal((await resolveOverlayTheme(dark)).theme, 'light');
});

test('mixed bright brand + dark headline zone keeps light text', async () => {
  const mixed = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: { r: 20, g: 25, b: 40 },
    },
  })
    .composite([{
      input: await sharp({
        create: { width: 1080, height: 220, channels: 3, background: { r: 245, g: 245, b: 245 } },
      }).png().toBuffer(),
      top: 0,
      left: 0,
    }])
    .png()
    .toBuffer();

  const { theme, regions } = await resolveOverlayTheme(mixed);
  assert.equal(theme, 'light');
  assert.ok(regions.peak >= BRIGHTNESS_THRESHOLD);
  assert.ok(regions.textBlock < BRIGHTNESS_THRESHOLD);
});

test('real reel frame picks dark text on bright upper-left hotspot', async () => {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const sample = readFileSync(join(process.cwd(), 'production/video/output/reel-image_2026-08-11-22-40-48_01.png'));
  const frame = await sharp(sample).resize(1080, 1920, { fit: 'cover' }).png().toBuffer();
  const { theme, luminance } = await resolveOverlayTheme(frame);
  assert.equal(theme, 'dark');
  assert.ok(luminance >= BRIGHTNESS_THRESHOLD);
});
