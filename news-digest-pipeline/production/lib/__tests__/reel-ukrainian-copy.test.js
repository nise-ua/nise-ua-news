import { describe, expect, it } from 'vitest';
import {
  assertFinishedReelCopy,
  ensureUkrainianOnScreenCopy,
  extractSourceLatinNames,
  hasCyrillic,
  looksNonUkrainian,
  looksUnfinishedSentence,
  restoreSourceLatinNames,
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
  it('restores source Latin names from phonetic Cyrillic overlay copy', () => {
    expect(extractSourceLatinNames({
      coreFact: 'Claude can write letters and share files.',
    })).toEqual(['Claude']);

    expect(restoreSourceLatinNames(
      'Клауд може сам писати листи.',
      ['Claude'],
    )).toBe('Claude може сам писати листи.');

    const shot = ensureUkrainianOnScreenCopy({
      coreFact: 'Google and Nvidia launch a new model this week.',
      headline: 'Нвідіа виходить на ринок із новою моделлю.',
      detailText: 'Гугл представив нову велику модель цього тижня.',
      spokenText: 'Нвідіа та Гугл розширюють інструменти для розробників.',
    });
    expect(shot.headline).toBe('Nvidia виходить на ринок із новою моделлю.');
    expect(shot.detailText).toBe('Google представив нову велику модель цього тижня.');
    expect(shot.spokenText).toBe('Nvidia та Google розширюють інструменти для розробників.');
  });

  it('restores Claude from coreFact when overlay used Клауд', () => {
    const shot = ensureUkrainianOnScreenCopy({
      coreFact: 'Claude can write letters and share a file by itself.',
      headline: 'Клауд може сам писати листи та ділитись файлом.',
      detailText: 'Нова функція Клауд дозволяє писати листи і ділитись файлами.',
      spokenText: 'Клауд тепер сам пише листи та ділиться файлами.',
    });
    expect(shot.headline).toBe('Claude може сам писати листи та ділитись файлом.');
    expect(shot.detailText).toBe('Нова функція Claude дозволяє писати листи і ділитись файлами.');
    expect(shot.spokenText).toBe('Claude тепер сам пише листи та ділиться файлами.');
  });

  it('does not invent Latin names when the shot source has none', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'Клауд може сам писати листи та ділитись файлом.',
      detailText: 'Нова функція дозволяє писати листи і ділитись файлами.',
      spokenText: 'Сервіс тепер сам пише листи та ділиться файлами.',
    });
    expect(shot.headline).toContain('Клауд');
    expect(shot.headline).not.toContain('Claude');
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

  it('replaces an over-long detail with an in-band spoken sentence', () => {
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'ChatGPT читатиме твої медичні дані.',
      detailText: 'Звучить зручно, поки не згадаєш, що це ще один шар посередника між тобою і твоїми власними даними.',
      spokenText: 'ChatGPT Health читає медичні дані через шар посередника.',
    });
    expect(shot.detailText).toBe('ChatGPT Health читає медичні дані через шар посередника.');
  });

  it('keeps a complete clause when detail and spoken are the same over-long sentence', () => {
    const longLine = 'Звучить зручно, поки не згадаєш, що це ще один шар посередника між тобою і твоїми власними даними.';
    const shot = ensureUkrainianOnScreenCopy({
      headline: 'ChatGPT Health читатиме твої медичні дані сьогодні.',
      detailText: longLine,
      spokenText: longLine,
    });
    expect(shot.detailText).toBe('Це ще один шар посередника між тобою і твоїми власними даними.');
    expect(() => assertFinishedReelCopy(shot)).not.toThrow();
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

  it('throws on one-word stub headlines like «Класика.»', () => {
    expect(() => assertFinishedReelCopy({
      headline: 'Класика.',
      detailText: 'Meta щедро підкидає токенів розробникам Llama.',
      spokenText: 'Meta дає безплатні токени розробникам Llama.',
    })).toThrow(/headline is out of band \(1 words\)/i);
  });

  it('throws when the headline is missing', () => {
    expect(() => assertFinishedReelCopy({
      headline: '',
      detailText: 'Meta дає безплатні токени розробникам Llama.',
      spokenText: 'Meta дає безплатні токени розробникам Llama.',
    })).toThrow(/headline is missing/i);
  });
});
