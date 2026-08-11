const STOP_WORDS = new Set([
  'about', 'after', 'also', 'from', 'have', 'into', 'more', 'that', 'than', 'their',
  'this', 'with', 'your', 'what', 'will', 'would', 'але', 'без', 'був', 'була', 'було',
  'вже', 'вони', 'для', 'дуже', 'його', 'йому', 'його', 'може', 'після', 'про', 'проти',
  'саме', 'свої', 'також', 'тому', 'через', 'ще', 'це', 'цей', 'якщо', 'який', 'яка', 'яке',
  'новини', 'новина', 'news', 'зміни', 'стало', 'стали', 'буде', 'будуть', 'один', 'одна',
]);

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu;
const EXPLICIT_HASHTAG_RE = /#[\p{L}\p{N}_-]+/gu;

function normalizeWord(word) {
  return word.replace(/^[-_]+|[-_]+$/g, '').toLowerCase();
}

/**
 * Build topical hashtags from the actual articles/digest instead of a static
 * config.md footer. Article titles are weighted more heavily than commentary
 * because they are concise and contain the subject of the story.
 */
export function buildDynamicHashtags(articles = [], digestContent = '', options = {}) {
  const configured = new Set(
    (options.staticSuffix || '').match(EXPLICIT_HASHTAG_RE) || [],
  );
  const scores = new Map();
  const explicit = [];

  for (const source of articles) {
    const title = source?.title || '';
    const commentary = source?.commentary || '';
    const text = `${title} ${title} ${commentary}`;
    for (const word of text.match(WORD_RE) || []) {
      const normalized = normalizeWord(word);
      if (!normalized || STOP_WORDS.has(normalized) || /^\d+$/.test(normalized)) continue;
      scores.set(normalized, (scores.get(normalized) || 0) + (title ? 3 : 1));
    }
    explicit.push(...(text.match(EXPLICIT_HASHTAG_RE) || []));
  }

  // If article metadata is unavailable, use the generated digest as a fallback.
  for (const word of digestContent.match(WORD_RE) || []) {
    const normalized = normalizeWord(word);
    if (!normalized || STOP_WORDS.has(normalized) || /^\d+$/.test(normalized)) continue;
    scores.set(normalized, (scores.get(normalized) || 0) + 1);
  }

  const result = [];
  for (const tag of explicit) {
    if (!configured.has(tag) && !result.includes(tag)) result.push(tag);
  }
  for (const [word] of [...scores.entries()].sort((a, b) => b[1] - a[1])) {
    const tag = `#${word}`;
    if (!configured.has(tag) && !result.includes(tag)) result.push(tag);
    if (result.length >= (options.limit || 6)) break;
  }

  if (result.length === 0) result.push('#NiSeNews');
  return result.slice(0, options.limit || 6).join(' ');
}

/** Remove a model/config-generated hashtag-only footer before adding the real one. */
export function replaceHashtagFooter(content, hashtags, staticSuffix = '') {
  let cleaned = content.trim();
  const configuredTags = staticSuffix.match(EXPLICIT_HASHTAG_RE) || [];

  // Remove the known legacy footer even when it is on the same line as other text.
  if (configuredTags.length > 0) {
    const legacy = new RegExp(`(?:\\s*${configuredTags.join('\\s*')}\\s*)$`, 'i');
    cleaned = cleaned.replace(legacy, '').trim();
  }

  // Also remove a final line made exclusively of hashtags produced by the model.
  cleaned = cleaned.replace(/(?:\n|^)\s*(?:#[\p{L}\p{N}_-]+\s*)+$/u, '').trim();
  return `${cleaned}\n\n${hashtags}`;
}