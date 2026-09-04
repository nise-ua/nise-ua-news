import { describe, expect, it } from 'vitest';
import { digestImageUrl, localImagePathFromUrl, mimeFromImageFilename } from './digest-image-file.js';

describe('digestImageUrl', () => {
  it('reads image_url from the digest', () => {
    expect(digestImageUrl({ image_url: 'https://example.com/images/digest-cover_1.png' }))
      .toBe('https://example.com/images/digest-cover_1.png');
  });

  it('returns empty when missing', () => {
    expect(digestImageUrl({})).toBe('');
  });
});

describe('localImagePathFromUrl', () => {
  it('returns null for a missing file', () => {
    expect(localImagePathFromUrl('https://example.com/images/missing-cover.png')).toBeNull();
  });

  it('rejects non-image names', () => {
    expect(localImagePathFromUrl('https://example.com/images/note.txt')).toBeNull();
  });
});

describe('mimeFromImageFilename', () => {
  it('maps common still-image extensions', () => {
    expect(mimeFromImageFilename('cover.png')).toBe('image/png');
    expect(mimeFromImageFilename('cover.JPG')).toBe('image/jpeg');
    expect(mimeFromImageFilename('cover.webp')).toBe('image/webp');
  });
});
