import { afterEach, describe, expect, it } from 'vitest';
import {
  completeCloudflareJson,
  extractJsonObject,
  extractLlmText,
  shouldPreferCloudflareLlm,
} from '../cloudflare-llm.js';
import { mockFetchResponses, unstubGlobals, withEnv } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('extractJsonObject', () => {
  it('parses JSON from a fenced model reply', () => {
    expect(extractJsonObject('Sure.\n```json\n{"shots":[]}\n```')).toEqual({ shots: [] });
  });
});

describe('extractLlmText', () => {
  it('reads OpenAI-compatible choices', () => {
    expect(extractLlmText({
      choices: [{ message: { content: '{"ok":true}' } }],
    })).toBe('{"ok":true}');
  });

  it('reads native Workers AI response', () => {
    expect(extractLlmText({ result: { response: '{"ok":1}' } })).toBe('{"ok":1}');
  });
});

describe('shouldPreferCloudflareLlm', () => {
  it('is true when Cloudflare keys exist', () => {
    const restore = withEnv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_LLM: undefined,
    });
    try {
      expect(shouldPreferCloudflareLlm()).toBe(true);
    } finally {
      restore();
    }
  });

  it('can be disabled', () => {
    const restore = withEnv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_LLM: '0',
    });
    try {
      expect(shouldPreferCloudflareLlm()).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('completeCloudflareJson', () => {
  it('posts chat completions and parses JSON', async () => {
    const fetchMock = mockFetchResponses([{
      urlIncludes: '/ai/v1/chat/completions',
      json: { choices: [{ message: { content: '{"shots":[{"shot":1}]}' } }] },
    }]);
    const restore = withEnv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
    });
    try {
      const parsed = await completeCloudflareJson('sys', 'user', { fetchFn: fetchMock });
      expect(parsed).toEqual({ shots: [{ shot: 1 }] });
      expect(String(fetchMock.mock.calls[0][0])).toContain('/ai/v1/chat/completions');
    } finally {
      restore();
    }
  });

  it('falls back to /ai/run when chat completions fails', async () => {
    const fetchMock = mockFetchResponses((url) => {
      if (String(url).includes('/chat/completions')) {
        return { status: 400, json: { errors: [{ message: 'bad chat' }] } };
      }
      return { json: { result: { response: '{"pass":true}' } } };
    });
    const restore = withEnv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
    });
    try {
      const parsed = await completeCloudflareJson('sys', 'user', { fetchFn: fetchMock });
      expect(parsed).toEqual({ pass: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });
});
