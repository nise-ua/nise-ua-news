/**
 * Template selection + copy preparation for the HTML-template reel path.
 *
 * Pure helpers: no filesystem, no browser, no side effects. Never cut a
 * sentence mid-thought to fit a character cap.
 */

import {
  ensureUkrainianOnScreenCopy,
  looksUnfinishedSentence,
} from '../../lib/reel-ukrainian-copy.js';

export const TEMPLATE_IDS = ['editorial-dark', 'editorial-light', 'accent-number'];

/** Soft target for the headline line block (complete sentences may exceed it). */
export const HEADLINE_MAX = 70;
/** Soft target for the detail sentence (complete sentences may exceed it). */
export const DETAIL_MAX = 120;

const DEFAULT_HEADLINE = 'Новини';

/** Round-robin template id for a zero-based shot index. */
export function selectTemplateId(shotIndex) {
  const raw = Number(shotIndex);
  const index = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return TEMPLATE_IDS[index % TEMPLATE_IDS.length];
}

/** Trim whitespace only. Do not slice words or clauses. */
export function truncateField(text, max) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim();
  const limit = Number(max);
  if (!source || !Number.isFinite(limit) || limit <= 0) return '';
  return source;
}

/**
 * @param {{ headline?: string, detailText?: string, spokenText?: string, shot?: number }} shot
 * @returns {{ headline: string, detailText: string, shotNumber: number }}
 */
export function prepareShotCopy(shot = {}) {
  const localized = ensureUkrainianOnScreenCopy(shot);
  const headline = truncateField(localized.headline, HEADLINE_MAX) || DEFAULT_HEADLINE;
  const detailText = truncateField(localized.detailText, DETAIL_MAX);
  const rawNumber = Number(shot.shot);
  const shotNumber = Number.isFinite(rawNumber) && rawNumber > 0 ? Math.floor(rawNumber) : 1;
  return { headline, detailText, shotNumber };
}

/**
 * @param {{ headline?: string, detailText?: string }} copy
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePreparedCopy({ headline, detailText } = {}) {
  const errors = [];
  if (typeof headline !== 'string' || headline.trim().length === 0) {
    errors.push('headline is empty');
  } else if (looksUnfinishedSentence(headline)) {
    errors.push('headline is unfinished');
  }
  if (typeof detailText !== 'string') {
    errors.push('detailText must be a string');
  } else if (detailText && looksUnfinishedSentence(detailText)) {
    errors.push('detailText is unfinished');
  }
  return { ok: errors.length === 0, errors };
}
