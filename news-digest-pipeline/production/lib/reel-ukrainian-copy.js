/**
 * Keep on-screen reel copy (headline / detailText / spokenText) in Ukrainian.
 * Storyboard LLMs sometimes paste English coreFact into detailText.
 */

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const LATIN_WORD_RE = /[A-Za-z]{3,}/g;

/**
 * Keep common company/product names and technical abbreviations in their
 * English display form. This is intentionally applied only to reel copy;
 * TTS has its own pronunciation preparation.
 */
const ENGLISH_DISPLAY_TERMS = [
  [/(?<!\p{L})ш[іi](?!\p{L})/giu, 'AI'],
  [/(?<!\p{L})гугл(?!\p{L})/giu, 'Google'],
  [/(?<!\p{L})(?:нвідіа|нвидіа|нвидиа)(?!\p{L})/giu, 'Nvidia'],
];

export function preserveEnglishDisplayTerms(text) {
  let result = String(text || '');
  for (const [pattern, replacement] of ENGLISH_DISPLAY_TERMS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

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

const DANGLING_HEADLINE_WORDS = new Set([
  'і', 'й', 'та', 'але', 'або', 'що', 'який', 'яка', 'яке', 'які',
  'для', 'про', 'у', 'в', 'на', 'з', 'із', 'до', 'як', 'це', 'від',
  'свій', 'своя', 'своє', 'свої', 'свого', 'своєї', 'свою', 'своєю',
  'його', 'її', 'їх', 'їхній', 'їхня', 'їхнє', 'їхні',
  'цей', 'ця', 'це', 'ці', 'цього', 'цієї', 'цих',
  'той', 'та', 'те', 'ті', 'того', 'тієї', 'тих',
]);

/**
 * Keep a generated headline as a complete standalone phrase.
 * This is intentionally conservative: it only removes an unmistakably
 * unfinished ending and never hard-cuts the middle of the fact.
 */
export function normalizeHeadline(text) {
  let result = preserveEnglishDisplayTerms(String(text || '').replace(/\s+/g, ' ').trim());
  result = result.replace(/[,:;—–-]+\s*$/, '').trim();
  const words = result.split(/\s+/);
  while (words.length > 1 && DANGLING_HEADLINE_WORDS.has(words.at(-1).toLowerCase().replace(/[.!?]$/, ''))) {
    words.pop();
  }
  return words.join(' ').trim();
}

/**
 * Prefer a Ukrainian detail line. If detailText is English/empty, fall back to
 * spokenText (Ukrainian voice line), then clear rather than show English.
 *
 * @param {object} shot
 * @returns {object}
 */
export function ensureUkrainianOnScreenCopy(shot = {}) {
  const headline = normalizeHeadline(shot.headline);
  let detailText = String(shot.detailText || '').trim();
  let spokenText = String(shot.spokenText || '').trim();
  detailText = preserveEnglishDisplayTerms(detailText);
  spokenText = preserveEnglishDisplayTerms(spokenText);

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
