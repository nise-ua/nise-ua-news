/**
 * Keep on-screen reel copy (headline / detailText / spokenText) in Ukrainian.
 * Storyboard LLMs sometimes paste English coreFact into detailText or emit
 * dangling clauses that only look finished because a period was appended.
 */

import { phoneticCyrillic } from './tts-pronunciation.js';

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const LATIN_WORD_RE = /[A-Za-z]{3,}/g;
const LATIN_NAME_RE = /\b(?:[A-Z]{2,}(?:[.-][A-Za-z0-9.]+)*|[A-Z][a-z]+(?:[A-Z][a-zA-Z0-9]*)+|[A-Z][a-z]{2,}(?:[.-][A-Za-z0-9]+)*|i[A-Z][a-z]+)\b/g;

const DANGLING_LAST_WORD = /^(і|й|та|або|чи|а|але|що|щоб|як|коли|якщо|який|яка|яке|які|на|у|в|з|із|зі|до|для|про|від|по|при|без|над|під|через|між|тепер|ще|один|одна|одне)$/iu;

function entityChunks(entities) {
  if (Array.isArray(entities)) {
    return entities.map((item) => (typeof item === 'string' ? item : item?.name || ''));
  }
  return [];
}

/** Latin proper names / acronyms already present on this shot (not a brand list). */
export function extractSourceLatinNames(shot = {}) {
  const blobs = [
    shot.coreFact,
    shot.sourceText,
    shot.visualSubject,
    ...entityChunks(shot.entities),
  ].filter(Boolean);
  const names = [];
  const seen = new Set();
  for (const blob of blobs) {
    const matches = String(blob).match(LATIN_NAME_RE) || [];
    for (const name of matches) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

function normalizeCyrillic(text) {
  return String(text || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[ʼ'`]/g, '')
    .replace(/[еёєьыъ]+$/u, '');
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost,
      );
    }
  }
  return grid[a.length][b.length];
}

function phoneticForms(latinName) {
  return [phoneticCyrillic(latinName), phoneticCyrillic(latinName, { au: 'au' })]
    .map(normalizeCyrillic)
    .filter(Boolean);
}

function phoneticDistance(cyrillicToken, latinName) {
  const token = normalizeCyrillic(cyrillicToken);
  if (token.length < 3) return null;
  let best = null;
  for (const form of phoneticForms(latinName)) {
    if (token === form) return 0;
    if (form.length >= 4 && token.startsWith(form)) {
      const extra = token.length - form.length;
      if (extra <= 2 && (best == null || extra < best)) best = extra;
      continue;
    }
    if (token.length >= 4 && form.startsWith(token)) {
      const extra = form.length - token.length;
      if (extra <= 2 && (best == null || extra < best)) best = extra;
      continue;
    }
    const dist = levenshtein(token, form);
    const maxLen = Math.max(token.length, form.length);
    if (dist <= 2 && maxLen >= 4 && (best == null || dist < best)) best = dist;
  }
  return best;
}

/**
 * Replace Cyrillic spellings of this shot's Latin names with the source form.
 * TTS pronunciation maps are not used here.
 */
export function restoreSourceLatinNames(text, names = []) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length === 0) return String(text || '');
  return String(text || '').replace(/[\p{L}\p{N}'’-]+/gu, (token) => {
    if (!CYRILLIC_RE.test(token)) return token;
    const core = stripWrappingQuotes(token);
    let bestName = null;
    let bestDist = Infinity;
    for (const name of list) {
      const dist = phoneticDistance(core, name);
      if (dist == null || dist >= bestDist) continue;
      bestDist = dist;
      bestName = name;
    }
    return bestName || token;
  });
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
/** Assert grace above the frozen 8–12 band. Do not raise this ceiling. */
export const DETAIL_HARD_MAX = DETAIL_WORD_MAX + 4;

export function countWords(text) {
  return String(text || '')
    .replace(/[.!?…]+$/u, '')
    .split(/\s+/)
    .filter(Boolean).length;
}

function completeSentencesFrom(text) {
  const preserved = String(text || '').trim();
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

function pickSentence(candidates, { min, max, exclude = [], hardMax } = {}) {
  const skip = new Set(exclude.filter(Boolean));
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || skip.has(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }
  if (unique.length === 0) return '';
  const pool = Number.isFinite(hardMax)
    ? unique.filter((candidate) => countWords(candidate) <= hardMax)
    : unique;
  if (pool.length === 0) return '';
  pool.sort((a, b) => bandScore(countWords(a), min, max) - bandScore(countWords(b), min, max));
  return pool[0];
}

function capitalizeUkrainian(text) {
  return String(text || '').replace(/^\s*(\p{L})/u, (letter) => letter.toLocaleUpperCase('uk-UA'));
}

function asFinishedUkrainianSentence(text) {
  const finished = ensureTerminalPunctuation(
    capitalizeUkrainian(String(text || '').trim().replace(/[,:;—–-]+$/, '')),
  );
  if (!finished || !hasCyrillic(finished) || looksUnfinishedSentence(finished) || looksNonUkrainian(finished)) {
    return '';
  }
  return finished;
}

/**
 * Recover a complete in-band sentence from an over-long line.
 * Split on clause boundaries only — never slice by word/character cap.
 */
function standaloneClausesFrom(sentence) {
  const body = String(sentence || '').replace(/[.!?…]+$/u, '').trim();
  if (!body) return [];
  return body
    .split(/\s+[—–]\s+|:\s+|;\s+|,\s+що\s+|,\s+щоб\s+/iu)
    .map((chunk) => asFinishedUkrainianSentence(chunk))
    .filter(Boolean);
}

function extractedDetailCandidatesFrom(...texts) {
  const out = [];
  for (const text of texts) {
    for (const sentence of completeSentencesFrom(text)) {
      if (countWords(sentence) > DETAIL_HARD_MAX) {
        out.push(...standaloneClausesFrom(sentence));
      }
    }
  }
  return out;
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
  const source = String(text || '').trim();
  const finished = source ? ensureTerminalPunctuation(source.replace(/[,:;—–-]+$/, '')) : '';
  if (finished && !looksUnfinishedSentence(finished) && !looksNonUkrainian(finished)) {
    return finished;
  }
  const fromSpoken = firstCompleteUkrainianSentence(spokenText);
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
  const names = extractSourceLatinNames(shot);
  const restore = (value) => restoreSourceLatinNames(value, names);
  const headlineIn = restore(shot.headline);
  const detailIn = restore(shot.detailText);

  let spokenText = restore(String(shot.spokenText || '').trim());
  spokenText = spokenText ? ensureTerminalPunctuation(spokenText) : '';
  if (spokenText && looksUnfinishedSentence(spokenText)) {
    const completeSpoken = firstCompleteUkrainianSentence(spokenText);
    if (completeSpoken) spokenText = completeSpoken;
  }

  const originalHeadlines = completeSentencesFrom(headlineIn);
  const headline = pickSentence(
    originalHeadlines.length > 0 ? originalHeadlines : completeSentencesFrom(spokenText),
    { min: HEADLINE_WORD_MIN, max: HEADLINE_WORD_MAX },
  ) || finishOrReplace(
    String(headlineIn || '').trim().replace(/[,:;—–-]+$/, ''),
    spokenText,
  );

  const detailOptions = {
    min: DETAIL_WORD_MIN,
    max: DETAIL_WORD_MAX,
    hardMax: DETAIL_HARD_MAX,
    exclude: [headline],
  };
  const detailText = pickSentence(
    [...completeSentencesFrom(detailIn), ...completeSentencesFrom(spokenText)],
    detailOptions,
  ) || pickSentence(
    extractedDetailCandidatesFrom(detailIn, spokenText),
    detailOptions,
  );

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
  const headline = String(shot.headline || '').trim();
  if (!headline) {
    throw new Error('Reel headline is missing');
  }
  const headlineWords = countWords(headline);
  if (headlineWords < HEADLINE_WORD_MIN || headlineWords > HEADLINE_WORD_MAX) {
    throw new Error(`Reel headline is out of band (${headlineWords} words): ${headline}`);
  }
  const detail = String(shot.detailText || '').trim();
  if (detail) {
    const sentences = detail.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 1) {
      throw new Error(`Reel detailText must be one sentence: ${detail}`);
    }
    const words = countWords(detail);
    if (words > DETAIL_HARD_MAX) {
      throw new Error(`Reel detailText is too long (${words} words): ${detail}`);
    }
  }
  return shot;
}
