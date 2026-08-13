export const DEFAULT_OPENING_HASHTAG = '#новини';

const LEAKED_HASHTAG_INSTRUCTION_RE = /\n(?:Хештеги|Hashtags)\s*:[\s\S]*$/i;
const HASHTAG_ONLY_TAIL_RE = /(?:\n|^)\s*(?:#[\p{L}\p{N}_-]+\s*)+$/u;

/** Remove leaked hashtag instructions and a final hashtag-only line. */
export function stripTrailingHashtags(content = '') {
  let cleaned = String(content || '').trim();
  cleaned = cleaned.replace(LEAKED_HASHTAG_INSTRUCTION_RE, '').trim();
  cleaned = cleaned.replace(HASHTAG_ONLY_TAIL_RE, '').trim();
  return cleaned;
}

/**
 * Canonical digest opening: `#новини` on its own line, then `1. …`.
 * Also strips leaked "Хештеги: …" instructions and trailing tag soup.
 */
export function normalizeDigestFormat(content = '', hashtag = DEFAULT_OPENING_HASHTAG) {
  const opening = String(hashtag || DEFAULT_OPENING_HASHTAG).trim() || DEFAULT_OPENING_HASHTAG;
  let body = stripTrailingHashtags(content);

  // Drop a leading standalone or inline opening hashtag (#AI, #news, #новини, …).
  body = body.replace(/^#\S+(?:\s+|(?=\d+\.))/, '').trim();

  if (!/^\d+\.\s/.test(body)) {
    body = `1. ${body}`;
  }

  return `${opening}\n${body}`;
}
