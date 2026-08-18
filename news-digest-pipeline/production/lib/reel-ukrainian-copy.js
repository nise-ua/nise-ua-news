/**
 * Keep on-screen reel copy (headline / detailText / spokenText) in Ukrainian.
 * Storyboard LLMs sometimes paste English coreFact into detailText or emit
 * dangling clauses that only look finished because a period was appended.
 */

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const LATIN_WORD_RE = /[A-Za-z]{3,}/g;

const DANGLING_LAST_WORD = /^(і|й|та|або|чи|а|але|що|щоб|як|коли|якщо|який|яка|яке|які|на|у|в|з|із|зі|до|для|про|від|по|при|без|над|під|через|між|тепер|ще|один|одна|одне)$/iu;

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

function stripWrappingQuotes(word) {
  return String(word || '').replace(/^[«"'(]+|[»"')]+$/g, '');
}

/**
 * Hard control: a reel line is unfinished when it has no terminal punctuation,
 * ends on a conjunction/preposition, trails off as «ще один шанс», or ends
 * with a short «а/і + verb» clause after a comma (e.g. «а тепер ріже»).
 */
export function looksUnfinishedSentence(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (!/[.!?…]$/.test(raw)) return true;
  const body = raw.replace(/[.!?…]+$/u, '').trim();
  if (!body || /[,:;—–-]$/.test(body)) return true;
  if (/ще один(?:\s+шанс)?$/iu.test(body)) return true;
  const words = body.split(/\s+/).filter(Boolean);
  const last = stripWrappingQuotes(words[words.length - 1]);
  if (DANGLING_LAST_WORD.test(last)) return true;
  const lastClause = body.split(/[,:;—–]\s+/).pop() || body;
  const clauseWords = lastClause.split(/\s+/).filter(Boolean);
  if (clauseWords.length <= 3 && /^(а|і|й|та)\s+/iu.test(lastClause)) {
    return true;
  }
  return false;
}

/** Frozen overlay bands. Do not retune without an explicit product decision. */
export const HEADLINE_WORD_MIN = 6;
export const HEADLINE_WORD_MAX = 11;
export const DETAIL_WORD_MIN = 8;
export const DETAIL_WORD_MAX = 12;

export function countWords(text) {
  return String(text || '')
    .replace(/[.!?…]+$/u, '')
    .split(/\s+/)
    .filter(Boolean).length;
}

function completeSentencesFrom(text) {
  const preserved = preserveEnglishDisplayTerms(String(text || '').trim());
  const parts = preserved.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  const sentences = [];
  for (const part of parts) {
    if (!hasCyrillic(part)) continue;
    const finished = ensureTerminalPunctuation(part.replace(/[,:;—–-]+$/, ''));
    if (finished && !looksUnfinishedSentence(finished) && !looksNonUkrainian(finished)) {
      sentences.push(finished);
    }
  }
  return sentences;
}

function bandScore(words, min, max) {
  const mid = (min + max) / 2;
  if (words >= min && words <= max) return Math.abs(words - mid) / 100;
  if (words < min) return 20 + (min - words) * 3;
  return 8 + (words - max);
}

function pickSentence(candidates, { min, max, exclude = [] } = {}) {
  const skip = new Set(exclude.filter(Boolean));
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || skip.has(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }
  if (unique.length === 0) return '';
  unique.sort((a, b) => bandScore(countWords(a), min, max) - bandScore(countWords(b), min, max));
  return unique[0];
}

function ensureTerminalPunctuation(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  return /[.!?…]$/.test(s) ? s : `${s.replace(/[,:;—–-]+$/, '')}.`;
}

function firstCompleteUkrainianSentence(text) {
  const parts = String(text || '').split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  const candidates = parts.length > 0 ? parts : [String(text || '').trim()];
  for (const part of candidates) {
    if (!part || !hasCyrillic(part)) continue;
    const finished = ensureTerminalPunctuation(part);
    if (!looksUnfinishedSentence(finished)) return finished;
  }
  return '';
}

function finishOrReplace(text, spokenText, { allowEmpty = false } = {}) {
  const source = preserveEnglishDisplayTerms(String(text || '').trim());
  const finished = source ? ensureTerminalPunctuation(source.replace(/[,:;—–-]+$/, '')) : '';
  if (finished && !looksUnfinishedSentence(finished) && !looksNonUkrainian(finished)) {
    return finished;
  }
  const fromSpoken = firstCompleteUkrainianSentence(preserveEnglishDisplayTerms(spokenText));
  if (fromSpoken) return fromSpoken;
  if (allowEmpty && (looksNonUkrainian(source) || looksUnfinishedSentence(finished))) {
    return '';
  }
  return finished;
}

/**
 * Prefer a Ukrainian detail line. If detailText is English/empty, fall back to
 * spokenText (Ukrainian voice line), then clear rather than show English.
 * Unfinished clauses are replaced with a complete spoken sentence.
 *
 * @param {object} shot
 * @returns {object}
 */
export function ensureUkrainianOnScreenCopy(shot = {}) {
  let spokenText = preserveEnglishDisplayTerms(String(shot.spokenText || '').trim());
  spokenText = spokenText ? ensureTerminalPunctuation(spokenText) : '';
  if (spokenText && looksUnfinishedSentence(spokenText)) {
    const completeSpoken = firstCompleteUkrainianSentence(spokenText);
    if (completeSpoken) spokenText = completeSpoken;
  }

  const originalHeadlines = completeSentencesFrom(shot.headline);
  const headline = pickSentence(
    originalHeadlines.length > 0 ? originalHeadlines : completeSentencesFrom(spokenText),
    { min: HEADLINE_WORD_MIN, max: HEADLINE_WORD_MAX },
  ) || finishOrReplace(
    String(shot.headline || '').trim().replace(/[,:;—–-]+$/, ''),
    spokenText,
  );

  const detailText = pickSentence([
    ...completeSentencesFrom(shot.detailText),
    ...completeSentencesFrom(spokenText),
  ], { min: DETAIL_WORD_MIN, max: DETAIL_WORD_MAX, exclude: [headline] });

  return {
    ...shot,
    headline,
    detailText,
    spokenText,
  };
}

export function assertFinishedReelCopy(shot = {}) {
  for (const field of ['headline', 'detailText', 'spokenText']) {
    const value = String(shot[field] || '').trim();
    if (!value) continue;
    if (looksUnfinishedSentence(value)) {
      throw new Error(`Reel ${field} is unfinished: ${value}`);
    }
  }
  const detail = String(shot.detailText || '').trim();
  if (detail) {
    const sentences = detail.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 1) {
      throw new Error(`Reel detailText must be one sentence: ${detail}`);
    }
    const words = countWords(detail);
    if (words > DETAIL_WORD_MAX + 4) {
      throw new Error(`Reel detailText is too long (${words} words): ${detail}`);
    }
  }
  return shot;
}
