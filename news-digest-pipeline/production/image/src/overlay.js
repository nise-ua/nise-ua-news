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

// Generic link text for all images
const GENERIC_LINK = 'Більше новин тут...';

/**
 * Create Template 1 SVG overlay - Bottom gradient with headline
 */
function createTemplate1(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `
    <defs>
      <linearGradient id="gradBottom" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="rgba(0,0,0,0.85)" />
        <stop offset="50%" stop-color="rgba(0,0,0,0.5)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0)" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#gradBottom)"/>
  `;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const textStartY = height - 400;
  const lines = wordWrap(headline, 38);
  let lineY = textStartY;
  lines.forEach(line => {
    svg += `<text x="${margin}" y="${lineY}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="bold">${escapeXml(line)}</text>`;
    lineY += 58;
  });
  // Generic link bottom LEFT
  svg += `<text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text></svg>`;
  return svg;
}

/**
 * Create Template 2 SVG overlay - Centered box
 */
function createTemplate2(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="black" opacity="0.3"/>`;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const boxY = height - 560;
  svg += `
    <rect x="${margin}" y="${boxY}" width="${width - margin*2}" height="360" rx="30" ry="30" fill="rgba(20, 21, 23, 0.85)" />
    <rect x="${width/2 - 180}" y="${boxY - 40}" width="360" height="70" rx="25" fill="#E41E48" />
    <text x="${width/2}" y="${boxY + 10}" fill="white" font-family="Arial, sans-serif" font-size="36" font-weight="900" text-anchor="middle">НОВИНИ</text>
  `;
  const lines = wordWrap(headline, 36);
  let lineY = boxY + 130;
  lines.forEach((line, i) => {
    if(i < 3) {
      svg += `<text x="${width/2}" y="${lineY}" fill="white" font-family="Arial, sans-serif" font-size="42" font-weight="bold" text-anchor="middle">${escapeXml(line)}</text>`;
      lineY += 54;
    }
  });
  // Generic link bottom LEFT
  svg += `
    <text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text>
  </svg>`;
  return svg;
}

/**
 * Create Template 3 SVG overlay - Centered with BREAKING label in Ukrainian
 */
function createTemplate3(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="black" opacity="0.35"/>`;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const textY = height - 420;
  svg += `
    <text x="${width/2}" y="${textY}" fill="#E41E48" font-family="Arial, sans-serif" font-size="56" font-weight="900" text-anchor="middle">ТЕРМІНОВО</text>
    <text x="${width/2}" y="${textY + 80}" fill="white" font-family="Arial, sans-serif" font-size="56" font-weight="900" text-anchor="middle">НОВИНИ</text>
  `;
  const lines = wordWrap(headline, 38);
  let lineY = textY + 160;
  lines.forEach((line, i) => {
    if(i < 2) {
      svg += `<text x="${width/2}" y="${lineY}" fill="white" font-family="Arial, sans-serif" font-size="40" font-weight="normal" text-anchor="middle" opacity="0.95">${escapeXml(line)}</text>`;
      lineY += 52;
    }
  });
  // Generic link bottom LEFT
  svg += `<text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text></svg>`;
  return svg;
}

/**
 * Create Template 4 SVG overlay - Two-line split headline
 */
function createTemplate4(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="black" opacity="0.25"/>`;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const textY = height - 460;
  const words = headline.split(' ');
  const title1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
  const title2 = words.slice(Math.ceil(words.length / 2)).join(' ');
  svg += `
    <text x="${margin}" y="${textY}" fill="white" font-family="Arial, sans-serif" font-size="58" font-weight="900">${escapeXml(title1)}</text>
    <text x="${margin}" y="${textY + 80}" fill="white" font-family="Arial, sans-serif" font-size="58" font-weight="900">${escapeXml(title2)}</text>
  `;
  // Generic link bottom LEFT
  svg += `<text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text></svg>`;
  return svg;
}

/**
 * Create Template 5 SVG overlay - Right-aligned headline
 */
function createTemplate5(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="black" opacity="0.45"/>`;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const textY = height - 480;
  const lines = wordWrap(headline, 38);
  let lineY = textY;
  lines.forEach((line, i) => {
    if(i < 3) {
      svg += `<text x="${width - margin}" y="${lineY}" fill="#E41E48" font-family="Arial, sans-serif" font-size="48" font-weight="bold" text-anchor="end">${escapeXml(line)}</text>`;
      lineY += 56;
    }
  });
  // Generic link bottom LEFT
  svg += `<text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text></svg>`;
  return svg;
}

/**
 * Create Template 6 SVG overlay - Left aligned two-part headline
 */
function createTemplate6(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="black" opacity="0.35"/>`;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const textY = height - 520;
  const words = headline.split(' ');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  svg += `
    <text x="${margin}" y="${textY}" fill="white" font-family="Arial, sans-serif" font-size="52" font-weight="normal">${escapeXml(line1)}</text>
    <text x="${margin}" y="${textY + 75}" fill="white" font-family="Arial, sans-serif" font-size="52" font-weight="bold">${escapeXml(line2)}</text>
    <rect x="${margin + 220}" y="${textY + 45}" width="280" height="60" fill="#F0A500" />
    <text x="${margin + 360}" y="${textY + 85}" fill="black" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">ВАЖЛИВО</text>
  `;
  // Generic link bottom LEFT
  svg += `<text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text></svg>`;
  return svg;
}

/**
 * Create Template 7 SVG overlay - Three line stacked
 */
function createTemplate7(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="black" opacity="0.35"/>`;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const textY = height - 520;
  svg += `
    <text x="${margin}" y="${textY}" fill="white" font-family="Arial, sans-serif" font-size="64" font-weight="900">НОВИНИ <tspan fill="#E41E48">ОНОВЛЕНО</tspan></text>
    <rect x="${margin + 450}" y="${textY - 55}" width="180" height="60" rx="15" fill="#E41E48" />
    <text x="${margin + 540}" y="${textY - 12}" fill="white" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">NiSeNews</text>
  `;
  const words = headline.split(' ');
  const line1 = words.slice(0, 3).join(' ');
  const line2 = words.slice(3, 6).join(' ');
  const line3 = words.slice(6).join(' ');
  svg += `
    <text x="${margin}" y="${textY + 130}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">${escapeXml(line1)}</text>
    <text x="${margin}" y="${textY + 190}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">${escapeXml(line2)}</text>
    <text x="${margin}" y="${textY + 250}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">${escapeXml(line3)}</text>
  `;
  // Generic link bottom LEFT
  svg += `<text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text></svg>`;
  return svg;
}

/**
 * Create Template 8 SVG overlay - Breaking story with CTA
 */
function createTemplate8(headline, bullets, author, width, height, newsUrl) {
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="black" opacity="0.4"/>`;
  const margin = 80;
  // NiSeNews branding top LEFT
  svg += `<text x="${margin}" y="${margin + 48}" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="900">NiSe<tspan fill="#E41E48">News</tspan></text>`;
  // Dots top RIGHT
  const dotGridX = width - margin - 150;
  const dotGridY = margin + 15;
  for(let row=0; row<3; row++) {
    for(let col=0; col<6; col++) {
      svg += `<circle cx="${dotGridX + col*22}" cy="${dotGridY + row*22}" r="5" fill="white" opacity="0.8" />`;
    }
  }
  const textY = height - 520;
  const words = headline.split(' ');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  svg += `
    <text x="${margin}" y="${textY}" fill="white" font-family="Arial, sans-serif" font-size="52" font-weight="normal">${escapeXml(line1)}</text>
    <text x="${margin}" y="${textY + 75}" fill="white" font-family="Arial, sans-serif" font-size="52" font-weight="bold">${escapeXml(line2)}</text>
    <rect x="${margin + 220}" y="${textY + 35}" width="280" height="60" fill="#F0A500" />
    <text x="${margin + 360}" y="${textY + 75}" fill="black" font-family="Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">ЧИТАТИ</text>
  `;
  // Orange audio circle button at bottom right
  svg += `
    <circle cx="${width - margin - 35}" cy="${height - margin - 15}" r="50" fill="#F0A500" />
    <path d="M ${width - margin - 55} ${height - margin - 35} L ${width - margin - 55} ${height - margin + 5} Q ${width - margin - 40} ${height - margin + 5} ${width - margin - 35} ${height - margin - 15} L ${width - margin - 15} ${height - margin - 35} Z" fill="white" />
  `;
  // Generic link bottom LEFT
  svg += `<text x="${margin}" y="${height - margin}" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold" opacity="0.9">${GENERIC_LINK}</text></svg>`;
  return svg;
}

/**
 * Main SVG creation router matching the 8 templates
 */
function createTextOverlay(headline, bullets, author, width, height, newsUrl, templateIndex = 1) {
  // Use a different template layout based on index (1 to 8)
  const id = templateIndex || Math.floor(Math.random() * 8) + 1;
  switch (id) {
    case 1: return createTemplate1(headline, bullets, author, width, height, newsUrl);
    case 2: return createTemplate2(headline, bullets, author, width, height, newsUrl);
    case 3: return createTemplate3(headline, bullets, author, width, height, newsUrl);
    case 4: return createTemplate4(headline, bullets, author, width, height, newsUrl);
    case 5: return createTemplate5(headline, bullets, author, width, height, newsUrl);
    case 6: return createTemplate6(headline, bullets, author, width, height, newsUrl);
    case 7: return createTemplate7(headline, bullets, author, width, height, newsUrl);
    case 8: return createTemplate8(headline, bullets, author, width, height, newsUrl);
    default: return createTemplate1(headline, bullets, author, width, height, newsUrl);
  }
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
  return str.replace(/&/g, String.fromCharCode(38) + 'amp;')
            .replace(/</g, String.fromCharCode(38) + 'lt;')
            .replace(/>/g, String.fromCharCode(38) + 'gt;')
            .replace(/"/g, String.fromCharCode(38) + 'quot;')
            .replace(/'/g, String.fromCharCode(38) + 'apos;');
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
 * Overlay text on an image buffer directly (used by generate.js)
 */
export async function applyTemplateOverlay(imageBuffer, headline, bullets, author, newsUrl, templateIndex = 1) {
  // Resize to Instagram 4:5
  const resized = await sharp(imageBuffer)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .toBuffer();

  // Create text overlay SVG
  const overlaySvg = createTextOverlay(headline, bullets, author, WIDTH, HEIGHT, newsUrl, templateIndex);
  const overlayBuffer = Buffer.from(overlaySvg);

  // Composite
  const final = await sharp(resized)
    .composite([{
      input: overlayBuffer,
      top: 0,
      left: 0,
    }])
    .png()
    .toBuffer();

  return final;
}

/**
 * Main: create final Instagram image from a file path
 */
export async function createInstagramImage({ templatePath, headline, bullets, author, outputPath, newsUrl, templateIndex = 1 }) {
  const imageBuffer = readFileSync(templatePath);
  const finalBuffer = await applyTemplateOverlay(imageBuffer, headline, bullets, author, newsUrl, templateIndex);

  // Save
  const { mkdirSync } = await import('fs');
  mkdirSync(dirname(outputPath), { recursive: true });
  await sharp(finalBuffer).toFile(outputPath);

  return outputPath;
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    // Test with sample data on random template
    const template = pickRandomTemplate();
    console.log('Template: ' + basename(template));

    const headline = 'ШІ брехати дослідникам і вчені в шоці від результату';
    const bullets = [
      '70% центральних банків бояться геополітики',
      'Z.ai випустила GLM-5.1 без NVIDIA',
      'Anthropic зросла в 20 разів за два роки',
      'Робочі професії випереджають IT',
      'Астронавти отримують $5 на день',
    ];
    const author = '@your_account';

    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const outputPath = join(OUTPUT_DIR, `test_overlay_${ts}.png`);
    const newsUrl = 'https://news.example.com/article/123';

    await createInstagramImage({ templatePath: template, headline, bullets, author, outputPath, newsUrl });
    console.log('Saved: ' + outputPath);
    return;
  }

  // CLI args mode
  const templatePath = args[0] || pickRandomTemplate();
  const headline = args.find((_, i) => args[i - 1] === '--headline') || 'Test Headline';
  const bulletsStr = args.find((_, i) => args[i - 1] === '--bullets') || 'Bullet one|Bullet two';
  const bullets = bulletsStr.split('|');
  const author = args.find((_, i) => args[i - 1] === '--author') || '@your_account';
  const newsUrl = args.find((_, i) => args[i - 1] === '--url') || '';

  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outputPath = join(OUTPUT_DIR, `instagram_${ts}.png`);

  await createInstagramImage({ templatePath, headline, bullets, author, outputPath, newsUrl });
  console.log('Saved: ' + outputPath);
}

// Only run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}