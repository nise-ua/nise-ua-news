import { afterEach, describe, expect, it } from 'vitest';
import { resolveMediaChatModel, resolveProductionLlmModel } from '../llm-client.js';
import { resolvePipelineDbPath, resolvePublicBaseUrl } from '../digest-store.js';
import { unstubGlobals, withEnv } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('resolveProductionLlmModel', () => {
  it('prefers LLM_MODEL over OPENAI_MODEL and CLAUDE_MODEL', () => {
    expect(resolveProductionLlmModel({
      LLM_MODEL: 'gpt-5.4-mini',
      OPENAI_MODEL: 'gpt-4o',
      CLAUDE_MODEL: 'claude-x',
    })).toBe('gpt-5.4-mini');
    expect(resolveProductionLlmModel({ OPENAI_MODEL: 'gpt-4o' })).toBe('gpt-4o');
    expect(resolveProductionLlmModel({})).toBe('gpt-5.4-mini');
  });

  it('does not send a Cursor Composer id to the cover chat model', () => {
    expect(resolveMediaChatModel({
      LLM_VENDOR: 'cursor',
      LLM_MODEL: 'composer-2.5',
    })).toBe('gpt-5.4-mini');
    expect(resolveMediaChatModel({
      LLM_VENDOR: 'openai',
      LLM_MODEL: 'gpt-5.4-mini',
    })).toBe('gpt-5.4-mini');
  });
});

describe('digest store paths', () => {
  it('prefers BASE_URL then SERVER_URL', () => {
    expect(resolvePublicBaseUrl({ BASE_URL: 'http://nas:3010/', SERVER_URL: 'http://localhost:3000' }))
      .toBe('http://nas:3010');
    expect(resolvePublicBaseUrl({ PORT: '4000' })).toBe('http://localhost:4000');
  });

  it('uses DB_PATH when set', () => {
    const restore = withEnv({ DB_PATH: '/tmp/news-digest.db' });
    try {
      expect(resolvePipelineDbPath()).toBe('/tmp/news-digest.db');
    } finally {
      restore();
    }
  });
});
