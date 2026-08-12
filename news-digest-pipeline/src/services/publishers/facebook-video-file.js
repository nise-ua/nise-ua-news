/**
 * Resolve digest reel/video bytes from a local output file when possible,
 * otherwise fetch the public URL.
 */
import { existsSync, readFileSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const VIDEO_OUTPUT_DIR = join(__dirname, '../../../production/video/output');

export function digestVideoUrl(digest) {
  return digest?.video_url || digest?.reel_url || '';
}

export function localVideoPathFromUrl(videoUrl) {
  if (!videoUrl) return null;
  try {
    const pathname = new URL(videoUrl, 'http://localhost').pathname;
    const filename = decodeURIComponent(basename(pathname));
    if (!filename || !/\.mp4$/i.test(filename) || filename.includes('..')) return null;
    const localPath = join(VIDEO_OUTPUT_DIR, filename);
    return existsSync(localPath) ? localPath : null;
  } catch {
    return null;
  }
}

export async function loadVideoBuffer(videoUrl) {
  const localPath = localVideoPathFromUrl(videoUrl);
  if (localPath) {
    return { buffer: readFileSync(localPath), localPath };
  }

  const videoResp = await fetch(videoUrl);
  if (!videoResp.ok) {
    throw new Error(`Failed to fetch video (${videoResp.status})`);
  }
  const arrayBuffer = await videoResp.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), localPath: null };
}
