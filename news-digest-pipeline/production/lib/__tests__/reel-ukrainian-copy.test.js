import { describe, expect, it } from 'vitest';
import {
  assertFinishedReelCopy,
  ensureUkrainianOnScreenCopy,
  hasCyrillic,
  looksNonUkrainian,
  looksUnfinishedSentence,
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
      detailText: 'Гугл представив нову велику модель AI цього тижня.',
      spokenText: 'Нвідіа та Гугл розширюють AI-інструменти для розробників.',
    });
    expect(shot.headline).toBe('AI від Nvidia виходить на ринок.');
    expect(shot.detailText).toBe('Google представив нову велику модель AI цього тижня.');
    expect(shot.spokenText).toBe('Nvidia та Google розширюють AI-інструменти для розробників.');
  });

  it('keeps Ukrainian detailText', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'ШІ прискорює перевірку коду.',
      detailText: 'Фінальне рішення після перевірки коду залишається за людиною.',
      spokenText: 'ШІ прискорює перевірку коду на сорок відсотків сьогодні.',
    });
    expect(shot.detailText).toBe('Фінальне рішення після перевірки коду залишається за людиною.');
  });

  it('replaces English detailText with Ukrainian spokenText', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'ШІ-акції ростуть на Уолл-стріт.',
      detailText: 'Stock increase attributed to CoreWeave and NVIDIA.',
      spokenText: 'Зростання акцій пояснюють різким прискоренням CoreWeave та NVIDIA.',
    });
    expect(shot.detailText).toBe('Зростання акцій пояснюють різким прискоренням CoreWeave та NVIDIA.');
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

  it('replaces a dangling headline with the spoken sentence', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'Amazon починав з продажу книжок, а тепер ріже.',
      detailText: 'Рідкісні видання відправляють на склад у Лас-Вегасі.',
      spokenText: 'Amazon почав різати рідкісні книжки на складі в Лас-Вегасі.',
    });
    expect(shot.headline).toBe('Amazon почав різати рідкісні книжки на складі в Лас-Вегасі.');
    expect(looksUnfinishedSentence(shot.headline)).toBe(false);
  });

  it('replaces a dangling detail that trails off after «ще один шанс»', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'AI нарешті звільнив людину.',
      detailText: 'Claude забув власний довідник і ледь не дав ще один шанс.',
      spokenText: 'Claude звільнив співробітника після пів року постійних запізнень.',
    });
    expect(shot.detailText).toBe('Claude звільнив співробітника після пів року постійних запізнень.');
  });

  it('keeps a single 8-12 word detail instead of two long sentences', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'Anthropic стежить за кожним текстом Claude.',
      detailText: 'Тепер кожен текст від Claude матиме прихований штамп — наче маркування на яйцях, тільки невидиме і без терміну придатності. Сама ідея майже елегантна: підкинути монетку не навмання, а за секретною схемою, щоб потім довести, що це була саме твоя монетка.',
      spokenText: 'Claude додає прихований водяний знак у кожну відповідь.',
    });
    expect(shot.detailText.split(/(?<=[.!?])\s+/)).toHaveLength(1);
    const words = shot.detailText.replace(/[.!?…]+$/u, '').split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(8);
    expect(words.length).toBeLessThanOrEqual(12);
    expect(shot.detailText).toBe('Claude додає прихований водяний знак у кожну відповідь.');
  });

  it('replaces a too-short detail with a fuller spoken sentence', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'Amazon починав із продажу книжок.',
      detailText: 'Тепер ріже їх на шматки.',
      spokenText: 'Amazon ріже рідкісні книжки на шматки на складі в Лас-Вегасі.',
    });
    const words = shot.detailText.replace(/[.!?…]+$/u, '').split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(8);
    expect(shot.detailText).toBe('Amazon ріже рідкісні книжки на шматки на складі в Лас-Вегасі.');
  });
});

describe('looksUnfinishedSentence', () => {
  it('flags missing objects and dangling last words', () => {
    expect(looksUnfinishedSentence('Amazon починав з продажу книжок, а тепер ріже.')).toBe(true);
    expect(looksUnfinishedSentence('Claude ледь не дав ще один шанс.')).toBe(true);
    expect(looksUnfinishedSentence('Фінальне рішення залишається за людиною.')).toBe(false);
  });
});

describe('assertFinishedReelCopy', () => {
  it('throws when a field is still unfinished', () => {
    expect(() => assertFinishedReelCopy({
      headline: 'Amazon починав з продажу книжок, а тепер ріже.',
      detailText: 'Склад працює в Лас-Вегасі.',
      spokenText: 'Amazon ріже книжки на складі в Лас-Вегасі.',
    })).toThrow(/headline is unfinished/i);
  });
});
