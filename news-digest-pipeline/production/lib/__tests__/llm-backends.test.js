import { afterEach, describe, expect, it } from 'vitest';
import {
  callLlmJson,
  callLlmText,
  parseJsonObject,
  resolveLlmModel,
  resolveLlmVendor,
} from '../llm-backends.js';
import { mockFetchResponses, unstubGlobals, withEnv } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('resolveLlmVendor', () => {
  it('normalizes configured LLM_VENDOR', () => {
    expect(resolveLlmVendor({ LLM_VENDOR: '  Moonshot  ' })).toBe('moonshot');
    expect(resolveLlmVendor({ LLM_VENDOR: 'OpenRouter' })).toBe('openrouter');
    expect(resolveLlmVendor({ LLM_VENDOR: 'Google' })).toBe('google');
  });

  it('infers vendor from available API keys when LLM_VENDOR is not set', () => {
    expect(resolveLlmVendor({ MOONSHOT_API_KEY: 'sk-m' })).toBe('moonshot');
    expect(resolveLlmVendor({ OPENROUTER_API_KEY: 'sk-or' })).toBe('openrouter');
    expect(resolveLlmVendor({ GOOGLE_API_KEY: 'g-key' })).toBe('google');
    expect(resolveLlmVendor({ OPENAI_API_KEY: 'sk-oai' })).toBe('openai');
    expect(resolveLlmVendor({ ANTHROPIC_API_KEY: 'sk-ant' })).toBe('anthropic');
    expect(resolveLlmVendor({})).toBe('openai');
  });
});

describe('resolveLlmModel', () => {
  it('prefers explicitly configured model', () => {
    expect(resolveLlmModel('moonshot', 'custom-model')).toBe('custom-model');
  });

  it('defaults per vendor correctly', () => {
    expect(resolveLlmModel('moonshot', null, {})).toBe('kimi-k2.6');
    expect(resolveLlmModel('openrouter', null, {})).toBe('deepseek/deepseek-chat');
    expect(resolveLlmModel('google', null, {})).toBe('gemini-2.5-flash');
    expect(resolveLlmModel('openai', null, {})).toBe('gpt-4o');
    expect(resolveLlmModel('anthropic', null, {})).toBe('claude-3-5-sonnet-20241022');
  });

  it('respects CLAUDE_MODEL and OPENAI_MODEL env vars', () => {
    expect(resolveLlmModel('moonshot', null, { CLAUDE_MODEL: 'kimi-k2.6' })).toBe('kimi-k2.6');
    expect(resolveLlmModel('openrouter', null, { CLAUDE_MODEL: 'deepseek/deepseek-reasoner' })).toBe('deepseek/deepseek-reasoner');
    expect(resolveLlmModel('google', null, { GOOGLE_MODEL: 'gemini-1.5-pro' })).toBe('gemini-1.5-pro');
  });
});

describe('parseJsonObject', () => {
  it('parses direct JSON string', () => {
    expect(parseJsonObject('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('extracts JSON object embedded in text or markdown fences', () => {
    const raw = 'Here is the response:\n```json\n{"headlines": ["one", "two"]}\n```\nDone!';
    expect(parseJsonObject(raw)).toEqual({ headlines: ['one', 'two'] });
  });

  it('throws when no JSON object found', () => {
    expect(() => parseJsonObject('plain text without json')).toThrow(/Failed to parse/);
  });
});

describe('callLlmText', () => {
  it('dispatches to moonshot', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: 'api.moonshot.ai',
      status: 200,
      json: {
        choices: [{ message: { content: '{"status":"ok"}' } }],
      },
    });

    const text = await callLlmText({
      system: 'Sys prompt',
      user: 'User prompt',
      vendor: 'moonshot',
      apiKey: 'test-moonshot-key',
      fetchFn,
      jsonMode: true,
    });

    expect(text).toBe('{"status":"ok"}');
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain('api.moonshot.ai/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-moonshot-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('kimi-k2.6');
    expect(body.messages).toHaveLength(2);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('dispatches to openrouter', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: 'openrouter.ai',
      status: 200,
      json: {
        choices: [{ message: { content: '{"result":"openrouter"}' } }],
      },
    });

    const text = await callLlmText({
      system: 'Sys prompt',
      user: 'User prompt',
      vendor: 'openrouter',
      apiKey: 'test-openrouter-key',
      fetchFn,
      jsonMode: true,
    });

    expect(text).toBe('{"result":"openrouter"}');
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain('openrouter.ai/api/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-openrouter-key');
  });

  it('dispatches to google', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: 'generativelanguage.googleapis.com',
      status: 200,
      json: {
        candidates: [
          {
            content: {
              parts: [{ text: '{"result":"google"}' }],
            },
          },
        ],
      },
    });

    const text = await callLlmText({
      system: 'Sys prompt',
      user: 'User prompt',
      vendor: 'google',
      model: 'google/gemini-2.5-flash',
      apiKey: 'test-google-key',
      fetchFn,
      jsonMode: true,
    });

    expect(text).toBe('{"result":"google"}');
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain('/models/gemini-2.5-flash:generateContent?key=test-google-key');
    const body = JSON.parse(options.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('dispatches to anthropic', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: 'api.anthropic.com',
      status: 200,
      json: {
        content: [{ text: '{"result":"anthropic"}' }],
      },
    });

    const text = await callLlmText({
      system: 'Sys prompt',
      user: 'User prompt',
      vendor: 'anthropic',
      apiKey: 'test-ant-key',
      fetchFn,
    });

    expect(text).toBe('{"result":"anthropic"}');
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain('api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-ant-key');
  });

  it('dispatches to openai', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: 'api.openai.com',
      status: 200,
      json: {
        choices: [{ message: { content: '{"result":"openai"}' } }],
      },
    });

    const text = await callLlmText({
      system: 'Sys prompt',
      user: 'User prompt',
      vendor: 'openai',
      apiKey: 'test-oai-key',
      fetchFn,
    });

    expect(text).toBe('{"result":"openai"}');
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain('api.openai.com/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-oai-key');
  });

  it('reads API key from environment when not passed in options', async () => {
    const fetchFn = mockFetchResponses({
      urlIncludes: 'api.moonshot.ai',
      status: 200,
      json: {
        choices: [{ message: { content: '{"status":"ok"}' } }],
      },
    });

    await withEnv({ LLM_VENDOR: 'moonshot', MOONSHOT_API_KEY: 'env-moonshot-key' }, async () => {
      const text = await callLlmText({
        user: 'User prompt',
        fetchFn,
      });

      expect(text).toBe('{"status":"ok"}');
      expect(fetchFn).toHaveBeenCalledOnce();
      const [, options] = fetchFn.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer env-moonshot-key');
    });
  });

  it('does not treat reasoning_content as JSON when content is empty', async () => {
    mockFetchResponses({
      urlIncludes: 'api.moonshot.ai',
      status: 200,
      json: {
        choices: [{
          finish_reason: 'length',
          message: { content: '', reasoning_content: 'thinking about shots' },
        }],
        usage: { completion_tokens_details: { reasoning_tokens: 2047 } },
      },
    });

    await expect(
      callLlmJson({
        user: 'Prompt',
        vendor: 'moonshot',
        apiKey: 'sk-m',
        fetchFn: fetch,
      }, 'storyboard'),
    ).rejects.toThrow(/finish_reason=length.*reasoning_tokens=2047/);
  });

  it('throws informative error on non-200 responses', async () => {
    mockFetchResponses({
      status: 429,
      json: { error: { message: 'Rate limit reached' } },
    });

    await expect(
      callLlmText({
        user: 'Hi',
        vendor: 'openai',
        apiKey: 'test-key',
        fetchFn: fetch,
      }),
    ).rejects.toMatchObject({ message: 'Rate limit reached', status: 429 });
  });
});

describe('callLlmJson', () => {
  it('calls callLlmText and parses JSON', async () => {
    const fetchFn = mockFetchResponses({
      status: 200,
      json: {
        choices: [{ message: { content: '```json\n{"headlines":["one","two"]}\n```' } }],
      },
    });

    const data = await callLlmJson(
      {
        user: 'Prompt',
        vendor: 'moonshot',
        apiKey: 'sk-m',
        fetchFn,
      },
      'headlines',
    );

    expect(data).toEqual({ headlines: ['one', 'two'] });
  });
});
