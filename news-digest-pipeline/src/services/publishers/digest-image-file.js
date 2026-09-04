/**
 * Resolve digest Facebook-cover bytes from a local output file when possible,
 * otherwise fetch the public URL.
 */
import { existsSync, readFileSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const IMAGE_OUTPUT_DIR = join(__dirname, '../../../production/image/output');

const IMAGE_NAME_RE = /\.(png|jpe?g|webp)$/i;

export function digestImageUrl(digest) {
  return digest?.image_url || '';
}

export function localImagePathFromUrl(imageUrl) {
  if (!imageUrl) return null;
  try {
    const pathname = new URL(imageUrl, 'http://localhost').pathname;
    const filename = decodeURIComponent(basename(pathname));
    if (!filename || !IMAGE_NAME_RE.test(filename) || filename.includes('..')) return null;
    const localPath = join(IMAGE_OUTPUT_DIR, filename);
    return existsSync(localPath) ? localPath : null;
  } catch {
    return null;
  }
}

export function mimeFromImageFilename(filename) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

export async function loadImageBuffer(imageUrl) {
  const localPath = localImagePathFromUrl(imageUrl);
  if (localPath) {
    return {
      buffer: readFileSync(localPath),
      localPath,
      mimeType: mimeFromImageFilename(localPath),
      filename: basename(localPath),
    };
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch cover image (${response.status})`);
  }
  const pathname = (() => {
    try { return decodeURIComponent(basename(new URL(imageUrl, 'http://localhost').pathname)); }
    catch { return 'digest-cover.png'; }
  })();
  const filename = IMAGE_NAME_RE.test(pathname) ? pathname : 'digest-cover.png';
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    localPath: null,
    mimeType: mimeFromImageFilename(filename),
    filename,
  };
}
