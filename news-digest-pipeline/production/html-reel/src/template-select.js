/**
 * Template selection + copy preparation for the HTML-template reel path.
 *
 * Pure helpers: no filesystem, no browser, no side effects. The renderer picks
 * a template per shot index and feeds it validated, length-capped copy so the
 * fixed 1080x1920 layout never overflows its safe zone.
 */

export const TEMPLATE_IDS = ['editorial-dark', 'editorial-light', 'accent-number'];

/** Max characters for the headline line block. */
export const HEADLINE_MAX = 70;
/** Max characters for the detail sentence. */
export const DETAIL_MAX = 120;

const DEFAULT_HEADLINE = 'Новини';

/** Round-robin template id for a zero-based shot index. */
export function selectTemplateId(shotIndex) {
  const raw = Number(shotIndex);
  const index = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return TEMPLATE_IDS[index % TEMPLATE_IDS.length];
}

/** Trim text to `max` characters, cutting at a word boundary when one is close. */
export function truncateField(text, max) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim();
  const limit = Number(max);
  if (!source || !Number.isFinite(limit) || limit <= 0) return '';
  if (source.length <= limit) return source;

  const clipped = source.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(' ');
  const base = lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return base.replace(/[\s,;:—–-]+$/, '');
}

/**
 * @param {{ headline?: string, detailText?: string, shot?: number }} shot
 * @returns {{ headline: string, detailText: string, shotNumber: number }}
 */
export function prepareShotCopy(shot = {}) {
  const headline = truncateField(shot.headline, HEADLINE_MAX) || DEFAULT_HEADLINE;
  const detailText = truncateField(shot.detailText, DETAIL_MAX);
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
  } else if (headline.length > HEADLINE_MAX) {
    errors.push(`headline exceeds ${HEADLINE_MAX} chars`);
  }
  if (typeof detailText !== 'string') {
    errors.push('detailText must be a string');
  } else if (detailText.length > DETAIL_MAX) {
    errors.push(`detailText exceeds ${DETAIL_MAX} chars`);
  }
  return { ok: errors.length === 0, errors };
}
