/**
 * Render reel background frames from local HTML templates via headless Chromium.
 *
 * This is the alternative to AI image generation: templates are filled with the
 * shot copy and screenshotted at exactly 1080x1920, so the produced PNG already
 * contains branding + headline + detail. Downstream clip generation must set
 * `overlay: false` to avoid drawing the SVG overlay on top of baked-in text.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { projectRoot, scriptDir } from '../../lib/logging.js';
import { prepareShotCopy, selectTemplateId, validatePreparedCopy } from './template-select.js';

export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

const __dirname = scriptDir(import.meta.url);
export const ROOT = projectRoot(import.meta.url, 3);
export const TEMPLATES_DIR = join(__dirname, '..', 'templates');

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert http(s)/data/file image references into a data URI for setContent.
 */
export async function toBackgroundDataUri(imageUrlOrPath, { fetchFn = globalThis.fetch } = {}) {
  if (!imageUrlOrPath) return '';
  const src = String(imageUrlOrPath);
  if (src.startsWith('data:')) return src;

  let buffer;
  let mime = 'image/png';
  if (src.startsWith('http://') || src.startsWith('https://')) {
    const res = await fetchFn(src);
    if (!res.ok) throw new Error(`Failed to fetch background image (${res.status})`);
    const contentType = res.headers?.get?.('content-type') || '';
    if (contentType.startsWith('image/')) mime = contentType.split(';')[0].trim();
    buffer = Buffer.from(await res.arrayBuffer());
  } else if (existsSync(src)) {
    buffer = readFileSync(src);
    if (/\.jpe?g$/i.test(src)) mime = 'image/jpeg';
    else if (/\.webp$/i.test(src)) mime = 'image/webp';
  } else {
    throw new Error(`Background image not found: ${src.slice(0, 80)}`);
  }
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * Substitute the template placeholders with HTML-escaped values.
 *
 * @param {string} html
 * @param {{ headline?: string, detail?: string, shotNumber?: number|string,
 *           brandNiSe?: string, brandNews?: string, backgroundImage?: string }} data
 */
export function fillTemplate(html, data = {}) {
  const values = {
    headline: data.headline ?? '',
    detail: data.detail ?? '',
    shotNumber: data.shotNumber ?? '',
    brandNiSe: data.brandNiSe ?? 'NiSe',
    brandNews: data.brandNews ?? 'News',
    backgroundImage: data.backgroundImage ?? '',
  };
  return String(html ?? '').replace(
    /\{\{(headline|detail|shotNumber|brandNiSe|brandNews|backgroundImage)\}\}/g,
    (_match, key) => escapeHtml(values[key]),
  );
}

async function launchChromium() {
  const { chromium } = await import('patchright');
  const launchOptions = {
    headless: true,
    // HTML reels can contain several large data-URI backgrounds. These flags
    // keep Chromium's renderer from exhausting shared memory on local hosts.
    args: ['--disable-dev-shm-usage', '--disable-gpu'],
  };
  try {
    return await chromium.launch(launchOptions);
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/Executable doesn't exist|browserType\.launch/i.test(msg)) throw err;
    // Prefer system Chrome when Patchright's bundled Chromium is not installed.
    return chromium.launch({ ...launchOptions, channel: 'chrome' });
  }
}

/**
 * Screenshot one filled template to a PNG file.
 *
 * @param {{ templateHtml: string, data?: object, outputPath: string, browser?: object }} params
 * @returns {Promise<string>} absolute output path
 */
export async function renderFrameToPng({ templateHtml, data = {}, outputPath, browser }) {
  if (!outputPath) throw new Error('renderFrameToPng requires an outputPath');

  const ownsBrowser = !browser;
  const activeBrowser = browser || await launchChromium();
  let page;
  try {
    page = await activeBrowser.newPage();
    await page.setViewportSize({ width: FRAME_WIDTH, height: FRAME_HEIGHT });
    await page.setContent(fillTemplate(templateHtml, data), { waitUntil: 'load' });
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      const imgs = [...document.images].filter((img) => img.getAttribute('src'));
      await Promise.all(imgs.map((img) => (
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
      )));
    });
    await page.screenshot({
      path: outputPath,
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT },
    });
  } finally {
    if (page) await page.close().catch(() => {});
    if (ownsBrowser) await activeBrowser.close().catch(() => {});
  }
  return outputPath;
}

function readTemplate(templatesDir, templateId) {
  const path = join(templatesDir, `${templateId}.html`);
  if (!existsSync(path)) throw new Error(`Template not found: ${path}`);
  return readFileSync(path, 'utf8');
}

/**
 * Render every shot to its own PNG background.
 *
 * @param {{ shots: object[], templatesDir?: string, outputDir: string,
 *           prefix?: string, log?: (msg: string) => void, keepHtml?: boolean }} params
 * @returns {Promise<Array<object>>} shots enriched with imageUrl/templateId, overlay=false
 */
export async function renderShotsToPngs({
  shots,
  templatesDir = TEMPLATES_DIR,
  outputDir,
  prefix = 'reel-html-image',
  log = () => {},
  keepHtml = false,
}) {
  if (!Array.isArray(shots) || shots.length === 0) return [];
  if (!outputDir) throw new Error('renderShotsToPngs requires an outputDir');
  mkdirSync(outputDir, { recursive: true });

  const templateCache = new Map();
  const browser = await launchChromium();
  const rendered = [];
  try {
    for (let i = 0; i < shots.length; i += 1) {
      const shot = shots[i];
      const templateId = selectTemplateId(i);
      if (!templateCache.has(templateId)) {
        templateCache.set(templateId, readTemplate(templatesDir, templateId));
      }

      const copy = prepareShotCopy(shot);
      const validation = validatePreparedCopy(copy);
      if (!validation.ok) {
        throw new Error(`Shot ${i + 1} copy invalid: ${validation.errors.join('; ')}`);
      }

      let backgroundImage = '';
      const rawBg = shot.backgroundImage || shot.backgroundUrl || '';
      if (rawBg) {
        backgroundImage = await toBackgroundDataUri(rawBg);
      }

      const data = {
        headline: copy.headline,
        detail: copy.detailText,
        shotNumber: copy.shotNumber,
        backgroundImage,
      };
      const templateHtml = templateCache.get(templateId);
      const outputPath = join(outputDir, `${prefix}_${String(i + 1).padStart(2, '0')}.png`);
      if (keepHtml) {
        writeFileSync(outputPath.replace(/\.png$/, '.html'), fillTemplate(templateHtml, {
          ...data,
          // Keep HTML dump small: note presence, don't embed megabyte data URIs.
          backgroundImage: backgroundImage ? '[data-uri omitted]' : '',
        }));
      }

      await renderFrameToPng({ templateHtml, data, outputPath, browser });
      log(`  Frame ${i + 1}/${shots.length} [${templateId}]${backgroundImage ? ' +AI bg' : ''}: ${outputPath}`);
      rendered.push({
        ...shot,
        headline: copy.headline,
        detailText: copy.detailText,
        imageUrl: outputPath,
        overlay: false,
        templateId,
      });
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return rendered;
}
