import { describe, expect, it } from 'vitest';
import { buildDynamicHashtags, replaceHashtagFooter } from './hashtags.js';

describe('dynamic hashtags', () => {
  it('uses article topics and does not reuse the legacy static footer', () => {
    const tags = buildDynamicHashtags([
      { title: 'Україна запускає супутник для оборони', commentary: 'Новий супутник посилить оборонні технології.' },
    ], '', { staticSuffix: '#AI #News' });

    expect(tags).toContain('#україна');
    expect(tags).toContain('#супутник');
    expect(tags).not.toContain('#AI');
    expect(tags).not.toContain('#News');
  });

  it('replaces a trailing static/model hashtag footer', () => {
    expect(replaceHashtagFooter('1. Story\n\nAI disclaimer\n#AI #News', '#Україна #технології', '#AI #News'))
      .toBe('1. Story\n\nAI disclaimer\n\n#Україна #технології');
  });
});