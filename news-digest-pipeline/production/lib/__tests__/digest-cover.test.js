import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coverSelectionUserPrompt,
  groundDigestCover,
  imagePayloadToBuffer,
  parseCoverSelection,
  selectDigestCover,
} from '../digest-cover.js';
import { SAMPLE_DIGEST } from './fixtures/digest.js';
import { parseDigestArticles } from '../digest.js';
import { unstubGlobals } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('parseCoverSelection', () => {
  const articles = parseDigestArticles(SAMPLE_DIGEST);

  it('maps a 1-based articleIndex onto the digest block', () => {
    const parsed = parseCoverSelection(JSON.stringify({
      articleIndex: 2,
      coreFact: 'Google removed an AI editing feature from Google Earth',
      entities: ['Google Earth'],
      newsTone: 'negative',
      visualSubject: 'Hand removing pins from a blank desk globe',
      prompt: 'photorealistic globe pins',
      pickReason: 'Найконкретніша візуальна дія.',
    }), articles);

    expect(parsed.articleIndex).toBe(2);
    expect(parsed.sourceText).toContain('Google вимкнув');
    expect(parsed.url).toContain('earth');
    expect(parsed.coreFact).toMatch(/Google Earth/i);
  });

  it('clamps an out-of-range index to a real article', () => {
    const parsed = parseCoverSelection('{"articleIndex": 99, "coreFact": "ByteDance trains a huge model"}', articles);
    expect(parsed.articleIndex).toBe(articles.length);
    expect(parsed.sourceText).toContain('ByteDance');
  });

  it('throws when the model returns no JSON', () => {
    expect(() => parseCoverSelection('nope', articles)).toThrow(/did not return JSON/);
  });
});

describe('groundDigestCover', () => {
  it('uses articleIndex to rotate cover palette and composition', () => {
    const first = groundDigestCover({
      articleIndex: 1,
      sourceText: 'Розробник працював ночами до виснаження.',
      url: '',
      coreFact: 'A developer worked through the night to exhaustion.',
      entities: ['developer'],
      newsTone: 'negative',
      visualSubject: 'An exhausted developer at a late-night work desk, face in hands beside crumpled blank notes',
      prompt: 'An exhausted developer at a late-night work desk beside crumpled blank notes.',
      pickReason: 'test',
    });
    const third = groundDigestCover({
      articleIndex: 3,
      sourceText: 'Розробник працював ночами до виснаження.',
      url: '',
      coreFact: 'A developer worked through the night to exhaustion.',
      entities: ['developer'],
      newsTone: 'negative',
      visualSubject: 'An exhausted developer at a late-night work desk, face in hands beside crumpled blank notes',
      prompt: 'An exhausted developer at a late-night work desk beside crumpled blank notes.',
      pickReason: 'test',
    });
    expect(first.prompt).not.toBe(third.prompt);
  });

  it('fails closed when an abstract software story has only unsafe visuals', () => {
    expect(() => groundDigestCover({
      articleIndex: 1,
      sourceText: 'Знову революція? OpenAI оновив ChatGPT.',
      url: '',
      coreFact: 'OpenAI updated ChatGPT with a reasoning-depth slider',
      entities: ['ChatGPT', 'OpenAI'],
      newsTone: 'positive',
      visualSubject: 'revolution in the streets with ChatGPT UI screens',
      prompt: 'curious funny revolution and a history book',
      pickReason: 'test',
    })).toThrow(/no concrete, story-specific photographic scene/i);
  });

  it('keeps an LLM video-call cover even if the prompt mentions a laptop', () => {
    const visualSubject = 'A polished webcam-style video call setup on a desk with a tablet or laptop showing a lifelike female digital avatar beside a solved Rubik cube';
    const grounded = groundDigestCover({
      articleIndex: 2,
      sourceText: 'Ванеса — цифрова дівчина від Tavus — переконала майже половину людей, що вона жива.',
      url: '',
      coreFact: 'A digital Tavus avatar convinced nearly half of viewers she was a real person in a video chat.',
      entities: ['Tavus'],
      newsTone: 'negative',
      visualSubject,
      prompt: `${visualSubject}. Vivid editorial cover photo, no readable text.`,
      pickReason: 'test',
    });
    expect(grounded.visualSubject).toMatch(/desk|avatar|rubik|webcam/i);
  });

  it('preserves a safe LLM-provided cover scene', () => {
    const custom = 'Hands placing a passport beside colorful luggage on a bright travel desk';
    const grounded = groundDigestCover({
      articleIndex: 2,
      sourceText: 'Meta Muse books travel.',
      url: '',
      coreFact: 'Meta released Muse, a personal AI agent that books travel.',
      entities: ['Meta', 'Muse'],
      newsTone: 'positive',
      visualSubject: custom,
      prompt: `${custom}. Vivid editorial cover photo.`,
      pickReason: 'test',
    });
    expect(grounded.visualSubject).toMatch(/passport|luggage|travel desk/i);
    expect(grounded.prompt).toMatch(/passport|luggage|travel desk/i);
  });
});

describe('selectDigestCover', () => {
  it('retries cover selection when coreFact is Cyrillic', async () => {
    const completeJson = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 1,
        coreFact: 'Anthropic тестує Claude Money з банківським рахунком',
        entities: ['Claude Money'],
        newsTone: 'negative',
        pickReason: 'Фінанси.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 1,
        coreFact: 'Anthropic is testing Claude Money, a chatbot linked to a bank account',
        entities: ['Claude Money'],
        newsTone: 'negative',
        pickReason: 'Фінанси.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'Hands tucking a blank payment card into a worn wallet next to sealed cash envelopes, warm window light, no card numbers no bank names no screens no watermarks',
        prompt: 'Hands tucking a blank payment card into a worn wallet. Vivid editorial cover photo.',
      }));

    const cover = await selectDigestCover(SAMPLE_DIGEST, { completeJson, log: () => {} });
    expect(completeJson).toHaveBeenCalledTimes(3);
    expect(cover.coreFact).toMatch(/bank account/i);
    expect(cover.coreFact).not.toMatch(/тестує/);
    expect(cover.visualSubject).toMatch(/wallet|payment card|envelopes/i);
  });

  it('uses the LLM pick and visual grounding when completeJson succeeds', async () => {
    const digest = `#новини 1. Meta показала квадратний кишеньковий брелок із мікрофоном.
https://example.com/pendant`;
    const completeJson = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 1,
        coreFact: 'A company showed a square pocket pendant with a microphone',
        entities: ['pocket pendant'],
        newsTone: 'neutral',
        pickReason: 'Конкретний фізичний пристрій.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'A small square metal pocket pendant lying on a sunlit wooden table, microphone grille, no icons, no logos, no text',
        prompt: 'A small square metal pocket pendant on a sunlit wooden table, vivid editorial photograph.',
      }));

    const cover = await selectDigestCover(digest, { completeJson, log: () => {} });
    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(cover.articleIndex).toBe(1);
    expect(cover.sourceText).toContain('брелок');
    expect(cover.fallback).toBe(false);
    expect(cover.visualSubject).toMatch(/pocket pendant/i);
    expect(cover.prompt).toMatch(/ZERO TEXT|no text/i);
  });

  it('rejects the Claude Sonnet word-salad cover and reselects a concrete story', async () => {
    const digest = `#новини 1. Розробник описав залежність від vibe-coding: працював ночами до повного виснаження.
https://example.com/vibe

2. Anthropic випустила Claude Sonnet 5.5: модель стала на 30% швидшою за тієї самої ціни.
https://example.com/sonnet

3. Інша лабораторія показала новий програмний агент.
https://example.com/agent`;
    const completeJson = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 2,
        coreFact: 'Anthropic released Claude Sonnet 5.5, claiming it is about 30% faster while keeping the same pricing.',
        entities: ['Anthropic', 'Claude Sonnet 5.5'],
        newsTone: 'positive',
        pickReason: 'Відомий реліз.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'Editorial photograph of Sonnet claiming it is about 30 faster while keeping same pricing beside beige computers and a globe',
        prompt: 'Beige PCs, server racks, metal boxes and a globe surrounding Sonnet claiming a faster release.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'Claude Sonnet as a beige computer box on a desk',
        prompt: 'Editorial photo of a PC tower, globe and server rack representing the model.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 1,
        coreFact: 'A developer described becoming addicted to vibe coding and working to exhaustion.',
        entities: ['developer', 'vibe coding'],
        newsTone: 'negative',
        pickReason: 'Людська сцена виснаження конкретна й фотографічна.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'An exhausted developer slumped at a cluttered late-night work desk, face in hands beside crumpled blank notes and an untouched meal',
        prompt: 'An exhausted developer at a late-night work desk, face in hands, crumpled blank notes, dramatic editorial window light.',
      }));

    const cover = await selectDigestCover(digest, { completeJson, log: () => {}, rotationSeed: 0 });
    const output = `${cover.visualSubject} ${cover.prompt}`.toLowerCase();

    expect(completeJson).toHaveBeenCalledTimes(5);
    expect(completeJson.mock.calls[3][1]).toContain('НЕ ОБИРАЙ відхилені блоки: 2');
    expect(cover.articleIndex).toBe(1);
    expect(cover.visualSubject).toMatch(/exhausted developer|work desk/i);
    expect(output).not.toMatch(/sonnet claiming|server rack|\bpcs?\b|\bcomputers?\b|\bglobe\b|\bbox(?:es)?\b/);
  });

  it('still asks the LLM for a later block when the selector repeats a rejected article', async () => {
    const digest = `#новини 1. Копенгаґен каже: чат-боти видають на 19% менш різні відповіді, ніж Google.
https://example.com/copenhagen

2. Ванеса пояснює кубик Рубика у відеочаті.
https://example.com/vanessa

3. McDonald's ставить різні ціни на БігМак у різних районах.
https://example.com/bigmac`;
    const completeJson = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 1,
        coreFact: 'University of Copenhagen found chatbot answers are less diverse than Google.',
        entities: ['University of Copenhagen'],
        newsTone: 'negative',
        pickReason: 'Дослідження.',
      }))
      .mockResolvedValueOnce(JSON.stringify({ unvisualizable: true }))
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 1,
        coreFact: 'University of Copenhagen found chatbot answers are less diverse than Google.',
        entities: ['University of Copenhagen'],
        newsTone: 'negative',
        pickReason: 'Дослідження.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'Hands turning a colorful Rubik cube on a sunlit wooden table, no logos no screens no text',
        prompt: 'Hands turning a Rubik cube on a sunlit table, vivid editorial photograph, no text.',
      }));

    const cover = await selectDigestCover(digest, { completeJson, log: () => {} });
    expect(cover.articleIndex).toBe(2);
    expect(cover.visualSubject).toMatch(/rubik|cube|table/i);
    expect(cover.fallback).toBe(false);
  });

  it('throws when the cover LLM fails instead of using a scene catalog', async () => {
    const concreteDigest = `#новини 1. Meta показала квадратний брелок, схожий на Тамагочі.
https://example.com/pendant`;
    await expect(selectDigestCover(concreteDigest, {
      completeJson: async () => {
        throw new Error('no credits');
      },
      log: () => {},
    })).rejects.toThrow(/Cover LLM did not produce a photographic scene/);
  });

  it('throws when the digest has no usable blocks', async () => {
    await expect(selectDigestCover('1. Коротко.\n🤖 footer', { log: () => {} }))
      .rejects.toThrow(/no news blocks/);
  });

  it('throws when cover selection is invoked without an LLM', async () => {
    await expect(selectDigestCover(SAMPLE_DIGEST, { log: () => {} }))
      .rejects.toThrow(/requires an LLM/);
  });

  it('uses the LLM finance scene after another block is unvisualizable', async () => {
    const digest = `#новини 1. Anthropic тестує Claude Money з банківським рахунком і зарплатою.
https://example.com/money

2. Лабораторія заявила, що нова модель стала на 30% швидшою.
https://example.com/model`;
    const completeJson = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 2,
        coreFact: 'A lab said the new model is 30% faster at the same price.',
        entities: ['model'],
        newsTone: 'positive',
        pickReason: 'Реліз.',
      }))
      .mockResolvedValueOnce(JSON.stringify({ unvisualizable: true }))
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 1,
        coreFact: 'Anthropic is testing Claude Money with a bank account.',
        entities: ['Claude Money'],
        newsTone: 'neutral',
        pickReason: 'Фінанси.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'Hands tucking a blank payment card into a worn wallet next to sealed cash envelopes, warm window light, no card numbers no bank names no screens no watermarks',
        prompt: 'Hands tucking a blank payment card into a worn wallet. Vivid editorial cover photo.',
      }));

    const cover = await selectDigestCover(digest, { completeJson, log: () => {} });
    expect(cover.articleIndex).toBe(1);
    expect(cover.fallback).toBe(false);
    expect(cover.visualSubject).toMatch(/wallet|payment card|envelope/i);
  });
});

describe('coverSelectionUserPrompt', () => {
  it('numbers every parsed article for the model', () => {
    const prompt = coverSelectionUserPrompt(parseDigestArticles(SAMPLE_DIGEST));
    expect(prompt).toContain('--- ARTICLE 1 ---');
    expect(prompt).toContain('--- ARTICLE 3 ---');
    expect(prompt).toContain('https://bytedance.com/llm');
  });
});

describe('imagePayloadToBuffer', () => {
  it('decodes a data URI', () => {
    const buffer = imagePayloadToBuffer('data:image/png;base64,aGVsbG8=');
    expect(buffer.toString()).toBe('hello');
  });

  it('returns null for http URLs so the caller can fetch', () => {
    expect(imagePayloadToBuffer('https://example.com/cover.png')).toBeNull();
  });
});
