/**
 * Shared logging + path helpers for production CLI scripts.
 *
 * API:
 * - log(msg, { console, now }) — `[HH:MM:SS] message` (ISO time slice 11..19)
 * - reportFatal(err, { console }) — `Fatal:` first line, then the rest of the message
 * - scriptDir(importMetaUrl) — dirname of the calling module
 * - projectRoot(importMetaUrl, up=3) — pipeline root from production/{image,video,audio}/src/
 *   (pass up=2 when calling from production/lib/)
 * - ROOT — pipeline root resolved from this file (production/lib → ../..)
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to news-digest-pipeline/ (from production/lib/). */
export const ROOT = join(__dirname, '..', '..');

/**
 * @param {string} msg
 * @param {{ console?: { log: (...args: unknown[]) => void }, now?: () => Date }} [opts]
 */
export function log(msg, { console: cons = console, now = () => new Date() } = {}) {
  const ts = now().toISOString().slice(11, 19);
  cons.log(`[${ts}] ${msg}`);
}

/**
 * Print a CLI failure so parent processes can pick a useful Fatal: line.
 * Multi-line messages (copy-review tables) keep the summary on line one.
 */
export function reportFatal(err, { console: cons = console } = {}) {
  const raw = String(err?.message || err || 'Unknown error').trim();
  const lines = raw.split(/\r?\n/).map((line) => line.trimEnd());
  const head = (lines[0] || 'Unknown error').replace(/^Fatal:\s*/i, '').trim() || 'Unknown error';
  cons.error(`Fatal: ${head}`);
  const rest = lines.slice(1).filter((line) => String(line).trim());
  if (rest.length) cons.error(rest.join('\n'));
}

/** Directory containing the module identified by import.meta.url. */
export function scriptDir(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}

/**
 * Resolve news-digest-pipeline project root from a module URL.
 * Default `up=3` matches scripts in `production/{image,video,audio}/src/`
 * (`join(__dirname, '..', '..', '..')`).
 *
 * @param {string} importMetaUrl
 * @param {number} [up=3]
 */
export function projectRoot(importMetaUrl, up = 3) {
  const parts = Array.from({ length: up }, () => '..');
  return join(scriptDir(importMetaUrl), ...parts);
}
