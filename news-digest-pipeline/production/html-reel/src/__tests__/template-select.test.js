import { describe, expect, it } from 'vitest';
import {
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

  it('keeps a complete sentence instead of cutting mid-thought', () => {
    const text = 'Українець запустив велику мовну модель на дешевому мікроконтролері.';
    expect(truncateField(text, 40)).toBe(text);
  });

  it('returns an empty string for missing input or bad limits', () => {
    expect(truncateField(null, 20)).toBe('');
    expect(truncateField('text', 0)).toBe('');
  });
});

describe('prepareShotCopy', () => {
  it('keeps finished sentences and the shot number', () => {
    const copy = prepareShotCopy({
      shot: 3,
      headline: 'Amazon почав різати рідкісні книжки на складі в Лас-Вегасі.',
      detailText: 'Рідкісні видання їдуть на склад із динозавром на логотипі.',
    });
    expect(copy.headline).toMatch(/Лас-Вегасі\.$/);
    expect(copy.detailText).toMatch(/логотипі\.$/);
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
    expect(validatePreparedCopy({ headline: 'Заголовок готовий.', detailText: 'Деталі повні.' })).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('reports empty headlines and unfinished details', () => {
    const result = validatePreparedCopy({
      headline: '',
      detailText: 'Amazon починав з продажу книжок, а тепер ріже.',
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/headline is empty/);
    expect(result.errors.some((e) => /unfinished/i.test(e))).toBe(true);
  });

  it('rejects a non-string detail', () => {
    expect(validatePreparedCopy({ headline: 'ok', detailText: null }).ok).toBe(false);
  });
});
