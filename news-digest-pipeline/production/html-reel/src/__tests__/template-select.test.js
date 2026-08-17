import { describe, expect, it } from 'vitest';
import {
  DETAIL_MAX,
  TEMPLATE_IDS,
  prepareShotCopy,
  selectTemplateId,
  truncateField,
  validatePreparedCopy,
} from '../template-select.js';

describe('selectTemplateId', () => {
  it('cycles through every template in order', () => {
    expect(TEMPLATE_IDS).toEqual(['editorial-dark', 'editorial-light', 'accent-number']);
    expect([0, 1, 2, 3, 4].map(selectTemplateId)).toEqual([
      'editorial-dark',
      'editorial-light',
      'accent-number',
      'editorial-dark',
      'editorial-light',
    ]);
  });

  it('falls back to the first template for invalid indexes', () => {
    expect(selectTemplateId(undefined)).toBe('editorial-dark');
    expect(selectTemplateId('nope')).toBe('editorial-dark');
    expect(selectTemplateId(-1)).toBe('editorial-dark');
  });
});

describe('truncateField', () => {
  it('keeps short text untouched and collapses whitespace', () => {
    expect(truncateField('  Новини   дня ', 40)).toBe('Новини дня');
  });

  it('cuts at a word boundary when one is close to the limit', () => {
    const text = 'Українець запустив велику мовну модель на дешевому мікроконтролері';
    const result = truncateField(text, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toBe('Українець запустив велику мовну модель');
    expect(text.startsWith(result)).toBe(true);
  });

  it('hard-cuts when there is no usable word boundary', () => {
    expect(truncateField('абвгдеєжзииклмноп', 6)).toBe('абвгде');
  });

  it('returns an empty string for missing input or bad limits', () => {
    expect(truncateField(null, 20)).toBe('');
    expect(truncateField('text', 0)).toBe('');
  });
});

describe('prepareShotCopy', () => {
  it('preserves headlines, caps detail text, and keeps the shot number', () => {
    const copy = prepareShotCopy({
      shot: 3,
      headline: 'а'.repeat(200),
      detailText: 'б'.repeat(300),
    });
    expect(copy.headline).toBe('а'.repeat(200));
    expect(copy.detailText.length).toBeLessThanOrEqual(DETAIL_MAX);
    expect(copy.shotNumber).toBe(3);
    expect(validatePreparedCopy(copy).ok).toBe(true);
  });

  it('substitutes a default headline and defaults the shot number to 1', () => {
    expect(prepareShotCopy({})).toEqual({ headline: 'Новини', detailText: '', shotNumber: 1 });
    expect(prepareShotCopy({ headline: '   ', shot: 0 }).headline).toBe('Новини');
  });
});

describe('validatePreparedCopy', () => {
  it('accepts valid copy', () => {
    expect(validatePreparedCopy({ headline: 'Заголовок', detailText: 'Деталі.' })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('reports empty headlines and oversized fields', () => {
    const result = validatePreparedCopy({ headline: '', detailText: 'x'.repeat(DETAIL_MAX + 1) });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/headline is empty/);
    expect(result.errors[1]).toMatch(/detailText exceeds/);
  });

  it('rejects a non-string detail', () => {
    expect(validatePreparedCopy({ headline: 'ok', detailText: null }).ok).toBe(false);
  });
});
