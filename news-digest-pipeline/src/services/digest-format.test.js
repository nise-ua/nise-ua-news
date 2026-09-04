import { describe, expect, it } from 'vitest';
import {
  joinOpeningHashtagToLead,
  normalizeDigestFormat,
  stripTrailingHashtags,
} from './digest-format.js';

const LEAKED_LATEST = `#AI  Ось вам ще одна "революційна" модель від NVIDIA. Немовтрон 3.5 Лайтнінг — 30 мільярдів параметрів, але активні лише 3. Таке собі "ефективне" розфарбування трафіку в кольори штучного інтелекту.

Головний хіт: тепер ваші "довгоживучі агенти" можуть тупити в 4 рази швидше!
https://developer.nvidia.com/blog/nvidia-nemotron-3-5-lightning

Хештеги: не використовуй старі шаблонні хештеги. Наприкінці залиш місце для тематичних хештегів, які система додасть після складання з реальних тем статей.

#nvidia #вам #модель #blog #nemotron #lightning`;

describe('stripTrailingHashtags', () => {
  it('removes leaked hashtag instructions and tag soup', () => {
    const cleaned = stripTrailingHashtags(LEAKED_LATEST);
    expect(cleaned).not.toMatch(/Хештеги:/);
    expect(cleaned).not.toMatch(/#nvidia/);
    expect(cleaned).toContain('NVIDIA');
    expect(cleaned).toContain('https://developer.nvidia.com/blog/nvidia-nemotron-3-5-lightning');
  });
});

describe('joinOpeningHashtagToLead', () => {
  it('joins a standalone #новини line onto the first numbered paragraph', () => {
    expect(joinOpeningHashtagToLead('#новини\n1. Перша новина.\n\n2. Друга.'))
      .toBe('#новини 1. Перша новина.\n\n2. Друга.');
  });

  it('leaves an already-inline opening unchanged', () => {
    const src = '#новини 1. Перша новина.\n\n2. Друга.';
    expect(joinOpeningHashtagToLead(src)).toBe(src);
  });

  it('does not rewrite captions without a numbered lead', () => {
    expect(joinOpeningHashtagToLead('Текст')).toBe('Текст');
  });
});

describe('normalizeDigestFormat', () => {
  it('rewrites #AI same-line opening to #новини 1. on the first line', () => {
    const out = normalizeDigestFormat(LEAKED_LATEST);
    expect(out.startsWith('#новини 1. Ось вам')).toBe(true);
    expect(out).not.toMatch(/^#AI/m);
    expect(out).not.toMatch(/Хештеги:/);
    expect(out).not.toMatch(/#nvidia|#вам|#модель|#blog|#nemotron|#lightning/);
  });

  it('joins a two-line opening into #новини 1. on the first line', () => {
    const src = `#новини
1. Перша новина про супутник.
https://example.com/sat

This digest is 100% prepared by AI.`;
    expect(normalizeDigestFormat(src)).toBe(`#новини 1. Перша новина про супутник.
https://example.com/sat

This digest is 100% prepared by AI.`);
  });

  it('keeps an already-correct same-line opening', () => {
    const src = `#новини 1. Перша новина про супутник.
https://example.com/sat

This digest is 100% prepared by AI.`;
    expect(normalizeDigestFormat(src)).toBe(src);
  });

  it('adds 1. when the first block has no number', () => {
    expect(normalizeDigestFormat('#новини\nТекст без номера.\nhttps://example.com'))
      .toBe('#новини 1. Текст без номера.\nhttps://example.com');
  });
});
