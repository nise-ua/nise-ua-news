import { describe, expect, it } from 'vitest';
import { buildFacebookPostPermalink, buildReelCaption } from './facebook-caption.js';

describe('buildFacebookPostPermalink', () => {
  it('builds a posts URL from Graph pageId_postId', () => {
    expect(buildFacebookPostPermalink('111', '111_222'))
      .toBe('https://www.facebook.com/111/posts/222');
  });

  it('uses pageId when only the story id is stored', () => {
    expect(buildFacebookPostPermalink('111', '222'))
      .toBe('https://www.facebook.com/111/posts/222');
  });

  it('keeps an already-absolute permalink', () => {
    expect(buildFacebookPostPermalink('111', 'https://www.facebook.com/nise/posts/9'))
      .toBe('https://www.facebook.com/nise/posts/9');
  });

  it('returns empty when the digest has no Facebook post', () => {
    expect(buildFacebookPostPermalink('111', null)).toBe('');
    expect(buildFacebookPostPermalink('111', '')).toBe('');
  });
});

describe('buildReelCaption', () => {
  it('puts the digest Facebook post link in the reel description', () => {
    expect(buildReelCaption({ pageId: '111', facebookPostId: '111_222' }))
      .toBe('📘 Більше новин тут: https://www.facebook.com/111/posts/222');
  });

  it('returns empty without a Facebook post id', () => {
    expect(buildReelCaption({ pageId: '111' })).toBe('');
  });
});
