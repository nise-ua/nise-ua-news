import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/image-backends.js', async () => {
  const actual = await vi.importActual('../../../lib/image-backends.js');
  return {
    ...actual,
    generateImage: vi.fn(),
    generateImageWithRetry: vi.fn(async (fn) => fn()),
    resolveImageVendor: vi.fn(() => 'google'),
  };
});

const { generateImage } = await import('../../../lib/image-backends.js');
const { generateAiBackgroundsForShots } = await import('../fetch-ai-backgrounds.js');

describe('generateAiBackgroundsForShots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns shots with backgroundImage when every provider call succeeds', async () => {
    generateImage.mockResolvedValue('data:image/png;base64,ok');
    const shots = [{ prompt: 'a phone on a desk', headline: 'Тест' }];
    const results = await generateAiBackgroundsForShots(shots, { log: () => {} });
    expect(results).toHaveLength(1);
    expect(results[0].backgroundImage).toBe('data:image/png;base64,ok');
  });

  it('throws the provider quota message instead of a generic empty-set error', async () => {
    generateImage.mockRejectedValue(new Error('Google gemini-2.5-flash-image 429: monthly spending cap'));
    await expect(
      generateAiBackgroundsForShots([{ prompt: 'a phone on a desk' }], { log: () => {} }),
    ).rejects.toThrow(/spending cap/i);
  });
});
