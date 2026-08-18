import { describe, expect, it } from 'vitest';
import {
  ensureUkrainianOnScreenCopy,
  hasCyrillic,
  looksNonUkrainian,
  preserveEnglishDisplayTerms,
} from '../reel-ukrainian-copy.js';

describe('hasCyrillic / looksNonUkrainian', () => {
  it('detects Ukrainian copy', () => {
    expect(hasCyrillic('Фінальне рішення за людиною.')).toBe(true);
    expect(looksNonUkrainian('Фінальне рішення за людиною.')).toBe(false);
  });

  it('flags English detail lines', () => {
    expect(looksNonUkrainian('Stock increase attributed to CoreWeave.')).toBe(true);
    expect(looksNonUkrainian('His company DeepMind is involved.')).toBe(true);
  });

  it('allows brand-only Latin as non-Ukrainian when no Cyrillic', () => {
    expect(looksNonUkrainian('NVIDIA')).toBe(true);
  });
});

describe('ensureUkrainianOnScreenCopy', () => {
  it('keeps common brands and abbreviations in English display form', () => {
    expect(preserveEnglishDisplayTerms('ШІ від Гугл та Нвідіа')).toBe(
      'AI від Google та Nvidia',
    );

    const shot = ensureUkrainianOnScreenCopy({
      headline: 'ШІ від Нвідіа виходить на ринок.',
      detailText: 'Гугл представив нову модель AI.',
      spokenText: 'Нвідіа та Гугл розширюють AI-інструменти.',
    });
    expect(shot.headline).toBe('AI від Nvidia виходить на ринок.');
    expect(shot.detailText).toBe('Google представив нову модель AI.');
    expect(shot.spokenText).toBe('Nvidia та Google розширюють AI-інструменти.');
  });

  it('keeps Ukrainian detailText', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'ШІ прискорює перевірку коду.',
      detailText: 'Фінальне рішення залишається за людиною.',
      spokenText: 'ШІ прискорює перевірку коду на сорок відсотків.',
    });
    expect(shot.detailText).toBe('Фінальне рішення залишається за людиною.');
  });

  it('replaces English detailText with Ukrainian spokenText', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'ШІ-акції ростуть на Уолл-стріт.',
      detailText: 'Stock increase attributed to CoreWeave and NVIDIA.',
      spokenText: 'Зростання акцій пояснюють прискоренням CoreWeave та NVIDIA.',
    });
    expect(shot.detailText).toBe('Зростання акцій пояснюють прискоренням CoreWeave та NVIDIA.');
    expect(hasCyrillic(shot.detailText)).toBe(true);
  });

  it('clears English detail when spokenText is missing or not Ukrainian', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'Заголовок українською.',
      detailText: 'The post was tagged as AI-generated.',
      spokenText: 'English spoken only.',
    });
    expect(shot.detailText).toBe('');
  });

  it('finishes a headline that ends with a comma', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'Anthropic вирішила, що нам бракувало драм у житті,',
      detailText: 'Кожен вибір слова тепер не випадковий.',
      spokenText: '',
    });
    expect(shot.headline).toBe('Anthropic вирішила, що нам бракувало драм у житті.');
  });

  it('adds terminal punctuation to Ukrainian detail without a period', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'Заголовок.',
      detailText: 'Деталь без крапки',
      spokenText: '',
    });
    expect(shot.detailText).toBe('Деталь без крапки.');
  });
});
