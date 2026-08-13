import { describe, expect, it } from 'vitest';
import { parseConfigMd } from './config.js';

describe('parseConfigMd', () => {
  it('reads #новини from the Ukrainian opening section and ignores Hashtags', () => {
    const parsed = parseConfigMd(`# Digest Configuration

## Хештег
#новини

## Кордон (відписка/бан)
This digest is 100% prepared by AI.

## Hashtags
Trailing topical hashtags are not added automatically.
`);

    expect(parsed.hashtag).toBe('#новини');
    expect(parsed.boundaryIntent).toBe('This digest is 100% prepared by AI.');
    expect(parsed.hashtagsSuffix).toBe('');
  });

  it('does not treat Хештеги / Hashtags as the opening tag', () => {
    const parsed = parseConfigMd(`## Хештеги
#AI #News

## Hashtag
#новини
`);
    expect(parsed.hashtag).toBe('#новини');
  });

  it('defaults to #новини when the opening section is missing', () => {
    expect(parseConfigMd('## Border\nDisclaimer only.').hashtag).toBe('#новини');
    expect(parseConfigMd('').hashtag).toBe('#новини');
  });

  it('parses English Border headings', () => {
    expect(parseConfigMd('## Border (Opt-out/Ban)\nThis digest is 100% prepared by AI.').boundaryIntent)
      .toBe('This digest is 100% prepared by AI.');
  });
});
