/**
 * Keep on-screen reel copy (headline / detailText / spokenText) in Ukrainian.
 * Storyboard LLMs sometimes paste English coreFact into detailText.
 */

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const LATIN_WORD_RE = /[A-Za-z]{3,}/g;

/** True when the string contains at least one Cyrillic letter. */
export function hasCyrillic(text) {
  return CYRILLIC_RE.test(String(text || ''));
}

/**
 * Heuristic: mostly Latin letters and no Cyrillic → treat as English (or other
 * Latin script), not Ukrainian on-screen copy.
 */
export function looksNonUkrainian(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (hasCyrillic(s)) return false;
  const latin = s.match(LATIN_WORD_RE);
  return Boolean(latin && latin.length > 0);
}

function firstSentence(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const parts = s.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  return parts[0] || s;
}

function ensureTerminalPunctuation(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/**
 * Prefer a Ukrainian detail line. If detailText is English/empty, fall back to
 * spokenText (Ukrainian voice line), then clear rather than show English.
 *
 * @param {object} shot
 * @returns {object}
 */
export function ensureUkrainianOnScreenCopy(shot = {}) {
  const headline = String(shot.headline || '').trim();
  let detailText = String(shot.detailText || '').trim();
  const spokenText = String(shot.spokenText || '').trim();

  if (looksNonUkrainian(detailText)) {
    const fromSpoken = firstSentence(spokenText);
    if (fromSpoken && hasCyrillic(fromSpoken) && fromSpoken !== headline) {
      detailText = ensureTerminalPunctuation(fromSpoken);
    } else {
      detailText = '';
    }
  } else if (detailText && !/[.!?…]$/.test(detailText)) {
    detailText = ensureTerminalPunctuation(detailText);
  }

  // Headline should also stay Ukrainian; do not invent a replacement here.
  return {
    ...shot,
    headline,
    detailText,
    spokenText,
  };
}
