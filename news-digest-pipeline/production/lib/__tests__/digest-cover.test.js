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
  it('uses articleIndex to rotate cover palette and composition', () => {
    const first = groundDigestCover({
      articleIndex: 1,
      sourceText: 'OpenAI оновив ChatGPT.',
      url: '',
      coreFact: 'OpenAI updated ChatGPT with a reasoning-depth slider',
      entities: ['ChatGPT', 'OpenAI'],
      newsTone: 'positive',
      visualSubject: 'ChatGPT UI screen with labels',
      prompt: 'ui screen',
      pickReason: 'test',
    });
    const third = groundDigestCover({
      articleIndex: 3,
      sourceText: 'OpenAI оновив ChatGPT.',
      url: '',
      coreFact: 'OpenAI updated ChatGPT with a reasoning-depth slider',
      entities: ['ChatGPT', 'OpenAI'],
      newsTone: 'positive',
      visualSubject: 'ChatGPT UI screen with labels',
      prompt: 'ui screen',
      pickReason: 'test',
    });
    expect(first.prompt).not.toBe(third.prompt);
  });

  it('rebuilds unsafe LLM visuals into a sanitized coreFact prompt', () => {
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
  it('uses the LLM pick and visual grounding when completeJson succeeds', async () => {
    const completeJson = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        articleIndex: 3,
        coreFact: 'ByteDance is developing a 10-trillion-parameter language model',
        entities: ['ByteDance'],
        newsTone: 'neutral',
        pickReason: 'Масштаб моделі.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        visualSubject: 'Researchers reviewing colorful unmarked hardware modules on a bright lab table',
        prompt: 'Bright editorial photo of researchers beside vivid unmarked hardware modules, no screens or labels.',
      }));

    const cover = await selectDigestCover(SAMPLE_DIGEST, { completeJson, log: () => {} });
    expect(completeJson).toHaveBeenCalledTimes(2);
    expect(cover.articleIndex).toBe(3);
    expect(cover.sourceText).toContain('ByteDance');
    expect(cover.fallback).toBe(false);
    expect(cover.visualSubject).toMatch(/researchers|hardware modules/i);
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
