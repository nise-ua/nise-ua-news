import { describe, expect, it } from 'vitest';
import { parseDigestItemTexts, parseDigestItems } from '../digest.js';
import { EXPECTED_SAMPLE_ARTICLES, SAMPLE_DIGEST } from './fixtures/digest.js';

describe('digest caller contract', () => {
  it('storyboard parseDigestItems returns { text, url } articles', () => {
    expect(parseDigestItems(SAMPLE_DIGEST)).toEqual(EXPECTED_SAMPLE_ARTICLES);
  });

  it('reel fallback parseDigestItemTexts returns text bodies only', () => {
    expect(parseDigestItemTexts(SAMPLE_DIGEST)).toEqual(
      EXPECTED_SAMPLE_ARTICLES.map((article) => article.text),
    );
  });

  it('storyboard module loads without a local digest parser', async () => {
    const storyboard = await import('../../video/src/storyboard.js');
    expect(typeof storyboard.generateStoryboard).toBe('function');
  });
});
