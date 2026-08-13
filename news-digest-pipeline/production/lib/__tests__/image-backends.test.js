import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  falImageSize,
  generateImage,
  generateOpenRouterImage,
  imageSizeForModel,
  isRetryableImageError,
  openRouterImageRequestBody,
  resolveImageModel,
  resolveImageVendor,
  safeLogUrl,
  sleep,
} from '../image-backends.js';
import { mockFetchResponses, unstubGlobals, withEnv } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('resolveImageModel', () => {
  it('defaults to dall-e-3', () => {
    expect(resolveImageModel()).toBe('dall-e-3');
    expect(resolveImageModel('')).toBe('dall-e-3');
    expect(resolveImageModel(null)).toBe('dall-e-3');
  });

  it('strips provider prefixes', () => {
    expect(resolveImageModel('openai/gpt-image-1')).toBe('gpt-image-1');
    expect(resolveImageModel('openai/dall-e-3')).toBe('dall-e-3');
  });

  it('maps gpt-image-1-mini to gpt-image-1', () => {
    expect(resolveImageModel('gpt-image-1-mini')).toBe('gpt-image-1');
    expect(resolveImageModel('openai/gpt-image-1-mini')).toBe('gpt-image-1');
  });
});

describe('imageSizeForModel', () => {
  it('uses feed sizes for 4:5', () => {
    expect(imageSizeForModel('dall-e-3', '4:5')).toBe('1024x1792');
    expect(imageSizeForModel('gpt-image-1', '4:5')).toBe('1024x1536');
    expect(imageSizeForModel('other', '4:5')).toBe('1024x1024');
  });

  it('uses reel sizes for 9:16', () => {
    expect(imageSizeForModel('dall-e-3', '9:16')).toBe('1024x1792');
    expect(imageSizeForModel('gpt-image-1', '9:16')).toBe('1024x1792');
    expect(imageSizeForModel('other', '9:16')).toBe('1024x1024');
  });

  it('defaults aspect to 4:5', () => {
    expect(imageSizeForModel('gpt-image-1')).toBe('1024x1536');
  });
});

describe('resolveImageVendor', () => {
  it('normalizes IMAGE_VENDOR and defaults by OpenAI key', () => {
    withEnv({ IMAGE_VENDOR: '  OpenRouter  ', OPENAI_API_KEY: undefined }, () => {
      expect(resolveImageVendor()).toBe('openrouter');
    });
    withEnv({ IMAGE_VENDOR: undefined, OPENAI_API_KEY: 'sk-test' }, () => {
      expect(resolveImageVendor()).toBe('dalle');
    });
    withEnv({ IMAGE_VENDOR: '', OPENAI_API_KEY: undefined }, () => {
      expect(resolveImageVendor()).toBe('fal');
    });
  });

  it('reads from an injected env object', () => {
    expect(resolveImageVendor({ IMAGE_VENDOR: 'Google', OPENAI_API_KEY: 'x' })).toBe('google');
  });
});

describe('isRetryableImageError', () => {
  it('detects 429 status and rate-limit messages', () => {
    expect(isRetryableImageError({ status: 429, message: 'nope' })).toBe(true);
    expect(isRetryableImageError(new Error('Rate Limit exceeded'))).toBe(true);
    expect(isRetryableImageError(new Error('Too Many Requests'))).toBe(true);
    expect(isRetryableImageError(new Error('temporarily unavailable'))).toBe(true);
    expect(isRetryableImageError(new Error('please try again later'))).toBe(true);
    expect(isRetryableImageError(new Error('invalid prompt'))).toBe(false);
  });
});

describe('openRouterImageRequestBody', () => {
  it('builds feed 4:5 body with 2K resolution', () => {
    expect(openRouterImageRequestBody('a prompt', 'qwen/qwen-image', '4:5')).toEqual({
      model: 'qwen/qwen-image',
      prompt: 'a prompt',
      n: 1,
      resolution: '2K',
      aspect_ratio: '4:5',
      output_format: 'png',
    });
  });

  it('special-cases gpt-image-1 for feed path', () => {
    expect(openRouterImageRequestBody('a prompt', 'openai/gpt-image-1', '4:5')).toEqual({
      model: 'openai/gpt-image-1',
      prompt: 'a prompt',
      n: 1,
      aspect_ratio: '2:3',
      output_format: 'png',
    });
  });

  it('builds reel 9:16 body with portrait note', () => {
    const body = openRouterImageRequestBody('a prompt', 'qwen/qwen-image', '9:16');
    expect(body.aspect_ratio).toBe('9:16');
    expect(body.resolution).toBe('2K');
    expect(body.output_format).toBe('png');
    expect(body.prompt).toContain('a prompt');
    expect(body.prompt).toMatch(/Portrait 9:16/i);
  });

  it('keeps gpt-image feed rules only for 4:5', () => {
    const body = openRouterImageRequestBody('a prompt', 'gpt-image-1', '9:16');
    expect(body.aspect_ratio).toBe('9:16');
    expect(body.resolution).toBeUndefined();
  });
});

describe('falImageSize', () => {
  it('returns 4:5 and 9:16 pixel sizes', () => {
    expect(falImageSize('4:5')).toEqual({ width: 1080, height: 1350 });
    expect(falImageSize('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(falImageSize()).toEqual({ width: 1080, height: 1350 });
  });
});

describe('sleep and safeLogUrl', () => {
  it('sleep resolves after delay', async () => {
    vi.useFakeTimers();
    const p = sleep(50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('truncates long URLs and data URIs', () => {
    expect(safeLogUrl(null)).toBe('null');
    expect(safeLogUrl(`data:image/png;base64,${'A'.repeat(100)}`)).toMatch(/base64 data URI/);
    expect(safeLogUrl(`https://example.com/${'x'.repeat(100)}`)).toMatch(/\.\.\.$/);
  });
});

describe('generateOpenRouterImage', () => {
  it('returns url on success', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: '/images',
      status: 200,
      json: { data: [{ url: 'https://cdn.example/img.png' }] },
    });

    const url = await generateOpenRouterImage('hello', 'qwen/qwen-image', {
      aspect: '4:5',
      fetchFn,
      apiKey: 'or-key',
      baseUrl: 'https://openrouter.ai/api/v1',
    });

    expect(url).toBe('https://cdn.example/img.png');
    expect(fetchFn).toHaveBeenCalledOnce();
    const [, options] = fetchFn.mock.calls[0];
    expect(JSON.parse(options.body).aspect_ratio).toBe('4:5');
  });

  it('returns data URI from b64_json', async () => {
    const fetchFn = mockFetchResponses({
      status: 200,
      json: { data: [{ b64_json: 'abc123', media_type: 'image/png' }] },
    });

    const url = await generateOpenRouterImage('hello', 'qwen/qwen-image', {
      fetchFn,
      apiKey: 'or-key',
    });

    expect(url).toBe('data:image/png;base64,abc123');
  });

  it('throws on non-ok response', async () => {
    mockFetchResponses({
      status: 429,
      json: { error: { message: 'rate limit' } },
    });

    await expect(
      generateOpenRouterImage('hello', 'qwen/qwen-image', { fetchFn: fetch, apiKey: 'or-key' }),
    ).rejects.toMatchObject({ message: 'rate limit', status: 429 });
  });
});

describe('generateImage', () => {
  it('dispatches to openrouter with mocked fetch', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: '/images',
      status: 200,
      json: { data: [{ url: 'https://cdn.example/openrouter.png' }] },
    });

    const url = await generateImage('a scenic prompt', {
      vendor: 'openrouter',
      aspect: '9:16',
      model: 'qwen/qwen-image',
      fetchFn,
      apiKey: 'or-key',
      baseUrl: 'https://openrouter.ai/api/v1',
    });

    expect(url).toBe('https://cdn.example/openrouter.png');
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.aspect_ratio).toBe('9:16');
    expect(body.prompt).toMatch(/Portrait 9:16/i);
  });
});
