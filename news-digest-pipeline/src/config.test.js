import { describe, expect, it } from 'vitest';
import { normalizePublishBackend, normalizeReelFrameMode, parseConfigMd, parsePostizChannelIds } from './config.js';

describe('normalizeReelFrameMode', () => {
  it('defaults to ai', () => {
    expect(normalizeReelFrameMode()).toBe('ai');
    expect(normalizeReelFrameMode('')).toBe('ai');
    expect(normalizeReelFrameMode('nope')).toBe('ai');
  });

  it('accepts ai and html case-insensitively', () => {
    expect(normalizeReelFrameMode('ai')).toBe('ai');
    expect(normalizeReelFrameMode('HTML')).toBe('html');
  });
});

describe('normalizePublishBackend', () => {
  it('defaults to legacy and accepts postiz', () => {
    expect(normalizePublishBackend()).toBe('legacy');
    expect(normalizePublishBackend('POSTIZ')).toBe('postiz');
  });
});

describe('parsePostizChannelIds', () => {
  it('splits a comma-separated allowlist', () => {
    expect(parsePostizChannelIds(' fb-1, ig-2 ')).toEqual(['fb-1', 'ig-2']);
  });
});

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
