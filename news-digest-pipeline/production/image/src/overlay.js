#!/usr/bin/env node

/**
 * Text Overlay on Template Image
 *
 * Takes a template image + text variables → produces final Instagram image.
 * Adds semi-transparent dark overlay + white text.
 *
 * Usage:
 *   node production/image/src/overlay.js <template-image> [--headline "..."] [--bullets "a|b|c"] [--author "..."]
 *   node production/image/src/overlay.js --test   # test with sample data
 */

import sharp from 'sharp';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

// Instagram 4:5 format
const WIDTH = 1080;
const HEIGHT = 1350;

/**
 * Create SVG text overlay with dark plashka + white text
 */
function createTextOverlay(headline, bullets, author, width, height) {
  // Layout calculations
  const padding = 60;
  const plashkaX = padding;
  const plashkaWidth = width - padding * 2;

  // Text sizing
  const headlineFontSize = 42;
  const bulletFontSize = 24;
  const authorFontSize = 22;
  const lineHeight = 1.3;

  // Word-wrap headline
  const headlineLines = wordWrap(headline, 22); // ~22 chars per line at 42px
  const headlineHeight = headlineLines.length * headlineFontSize * lineHeight;

  // Bullets
  const bulletLines = bullets.map(b => '→  ' + b);
  const bulletsHeight = bulletLines.length * bulletFontSize * lineHeight;

  // Total content height
  const gap = 30;
  const authorHeight = authorFontSize * lineHeight;
  const contentHeight = headlineHeight + gap + bulletsHeight + gap + authorHeight;

  // Plashka dimensions
  const plashkaPadding = 40;
  const plashkaHeight = contentHeight + plashkaPadding * 2;
  const plashkaY = (height - plashkaHeight) / 2; // center vertically

  // Build SVG
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  // Semi-transparent dark plashka with rounded corners
  svg += `<rect x="${plashkaX}" y="${plashkaY}" width="${plashkaWidth}" height="${plashkaHeight}" rx="20" ry="20" fill="rgba(0,0,0,0.7)"/>`;

  // Starting Y position for text (inside plashka)
  let textY = plashkaY + plashkaPadding;
  const textX = plashkaX + plashkaPadding;
  const maxTextWidth = plashkaWidth - plashkaPadding * 2;

  // Headline (white, bold, large)
  headlineLines.forEach((line, i) => {
    textY += headlineFontSize * lineHeight;
    svg += `<text x="${textX}" y="${textY}" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="${headlineFontSize}" font-weight="bold">${escapeXml(line)}</text>`;
  });

  textY += gap;

  // Thin separator line
  svg += `<line x1="${textX}" y1="${textY}" x2="${textX + maxTextWidth}" y2="${textY}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>`;
  textY += gap / 2;

  // Bullets (white, regular, smaller)
  bulletLines.forEach((line, i) => {
    textY += bulletFontSize * lineHeight;
    const truncated = line.length > 45 ? line.substring(0, 42) + '...' : line;
    svg += `<text x="${textX}" y="${textY}" fill="rgba(255,255,255,0.9)" font-family="Arial, Helvetica, sans-serif" font-size="${bulletFontSize}">${escapeXml(truncated)}</text>`;
  });

  textY += gap;

  // Author (white, right-aligned)
  svg += `<text x="${textX + maxTextWidth}" y="${textY + authorFontSize}" fill="rgba(255,255,255,0.6)" font-family="Arial, Helvetica, sans-serif" font-size="${authorFontSize}" text-anchor="end">${escapeXml(author)}</text>`;

  svg += '</svg>';
  return svg;
}

/**
 * Word wrap text to fit within character limit
 */
function wordWrap(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > maxChars && currentLine.length > 0) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + ' ' + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  return lines;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Pick a random template from the templates directory
 */
function pickRandomTemplate() {
  const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
  const idx = Math.floor(Math.random() * files.length);
  return join(TEMPLATES_DIR, files[idx]);
}

/**
 * Main: create final Instagram image
 */
export async function createInstagramImage({ templatePath, headline, bullets, author, outputPath }) {
  // Resize template to Instagram 4:5
  const resized = await sharp(templatePath)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .toBuffer();

  // Create text overlay SVG
  const overlaySvg = createTextOverlay(headline, bullets, author, WIDTH, HEIGHT);
  const overlayBuffer = Buffer.from(overlaySvg);

  // Composite: template + overlay
  const final = await sharp(resized)
    .composite([{
      input: overlayBuffer,
      top: 0,
      left: 0,
    }])
    .png()
    .toBuffer();

  // Save
  const { mkdirSync } = await import('fs');
  mkdirSync(dirname(outputPath), { recursive: true });
  await sharp(final).toFile(outputPath);

  return outputPath;
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    // Test with sample data on random template
    const template = pickRandomTemplate();
    console.log('Template: ' + basename(template));

    const headline = 'Claude научился врать исследователям и скрывать следы обмана';
    const bullets = [
      '70% центробанков боятся геополитики',
      'Z.ai выпустила GLM-5.1 без NVIDIA',
      'Anthropic выросла в 20 раз за два года',
      'Рабочие профессии обгоняют IT',
      'Астронавты получают $5 суточных',
    ];
    const author = '@your_account';

    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const outputPath = join(OUTPUT_DIR, `test_overlay_${ts}.png`);

    await createInstagramImage({ templatePath: template, headline, bullets, author, outputPath });
    console.log('Saved: ' + outputPath);
    return;
  }

  // CLI args mode
  const templatePath = args[0] || pickRandomTemplate();
  const headline = args.find((_, i) => args[i - 1] === '--headline') || 'Test Headline';
  const bulletsStr = args.find((_, i) => args[i - 1] === '--bullets') || 'Bullet one|Bullet two';
  const bullets = bulletsStr.split('|');
  const author = args.find((_, i) => args[i - 1] === '--author') || '@your_account';

  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outputPath = join(OUTPUT_DIR, `instagram_${ts}.png`);

  await createInstagramImage({ templatePath, headline, bullets, author, outputPath });
  console.log('Saved: ' + outputPath);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
