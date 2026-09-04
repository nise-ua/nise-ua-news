import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COVER_ASPECT,
  coverSelectionUserPrompt,
  fallbackCoverFromArticles,
  groundDigestCover,
  imagePayloadToBuffer,
  parseCoverSelection,
  selectDigestCover,
} from '../digest-cover.js';
import { SAMPLE_DIGEST, SAMPLE_DIGEST_SARCASTIC } from './fixtures/digest.js';
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

describe('fallbackCoverFromArticles', () => {
  it('uses the first digest block as the lead', () => {
    const articles = parseDigestArticles(SAMPLE_DIGEST);
    const fallback = fallbackCoverFromArticles(articles);
    expect(fallback.articleIndex).toBe(1);
    expect(fallback.fallback).toBe(true);
    expect(fallback.coreFact).toContain('OpenAI');
  });
});

describe('groundDigestCover', () => {
  it('rebuilds sarcastic visuals into a text-free grounded prompt', () => {
    const grounded = groundDigestCover({
      articleIndex: 1,
      sourceText: 'Знову революція? OpenAI оновив ChatGPT.',
      url: '',
      coreFact: 'OpenAI updated ChatGPT with a reasoning-depth slider',
      entities: ['ChatGPT', 'OpenAI'],
      newsTone: 'positive',
      visualSubject: 'revolution in the streets with ChatGPT UI screens',
      prompt: 'curious funny revolution and a history book',
      pickReason: 'test',
    });

    expect(grounded.aspect).toBe(COVER_ASPECT);
    expect(grounded.look).toBe('cover');
    expect(grounded.prompt.toLowerCase()).not.toMatch(/\brevolution\b|history book|curious funny/);
    expect(grounded.prompt).toMatch(/ZERO TEXT|no text/i);
    expect(grounded.visualSubject.toLowerCase()).not.toMatch(/chatgpt ui|revolution/);
    expect(grounded.prompt.toLowerCase()).not.toMatch(/dark server aisle|documentary photography/);
    expect(grounded.prompt).toMatch(/vivid|saturated|punchy|scroll/i);
  });
});

describe('selectDigestCover', () => {
  it('uses the LLM pick when completeJson returns a valid block', async () => {
    const completeJson = vi.fn().mockResolvedValue(JSON.stringify({
      articleIndex: 3,
      coreFact: 'ByteDance is developing a 10-trillion-parameter language model',
      entities: ['ByteDance'],
      newsTone: 'neutral',
      visualSubject: 'Engineers walking past unmarked GPU server racks',
      pickReason: 'Масштаб моделі.',
    }));

    const cover = await selectDigestCover(SAMPLE_DIGEST, { completeJson, log: () => {} });
    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(cover.articleIndex).toBe(3);
    expect(cover.sourceText).toContain('ByteDance');
    expect(cover.fallback).toBe(false);
    expect(cover.prompt).toMatch(/ZERO TEXT|no text/i);
  });

  it('falls back to the lead story when the LLM fails', async () => {
    const cover = await selectDigestCover(SAMPLE_DIGEST_SARCASTIC, {
      completeJson: async () => {
        throw new Error('no credits');
      },
      log: () => {},
    });
    expect(cover.articleIndex).toBe(1);
    expect(cover.fallback).toBe(true);
    expect(cover.sourceText).toContain('OpenAI');
  });

  it('throws when the digest has no usable blocks', async () => {
    await expect(selectDigestCover('1. Коротко.\n🤖 footer', { log: () => {} }))
      .rejects.toThrow(/no news blocks/);
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
