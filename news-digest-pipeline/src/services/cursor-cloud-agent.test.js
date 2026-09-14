import { LLM_VENDORS } from '../config.js';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCursorDigestPrompt,
  buildCursorModelSelection,
  CURSOR_TWO_PARAGRAPH_RULES,
  isComposerModel,
  isCursorLlmVendor,
  parseCursorDigestPayload,
  runCursorCloudAgent,
} from './cursor-cloud-agent.js';

describe('cursor vendor helpers', () => {
  it('lists cursor among switchable digest vendors', () => {
    expect(LLM_VENDORS).toContain('cursor');
    expect(LLM_VENDORS).toContain('openai');
  });
  it('detects the cursor vendor and maps Composer 2 to 2.5', () => {
    expect(isCursorLlmVendor('cursor')).toBe(true);
    expect(isCursorLlmVendor('openai')).toBe(false);
    expect(isComposerModel('composer-2')).toBe(true);
    expect(isComposerModel('composer-2.5')).toBe(true);
    expect(isComposerModel('gpt-5.4-mini')).toBe(false);
    expect(buildCursorModelSelection('composer-2')).toEqual({ id: 'composer-2.5' });
    expect(buildCursorModelSelection('composer-2', ['composer-2.5', 'grok-4.5'])).toEqual({
      id: 'composer-2.5',
    });
    expect(buildCursorModelSelection('composer-2', ['grok-4.5'])).toEqual({ id: 'grok-4.5' });
    expect(buildCursorModelSelection('claude-4.6-sonnet-thinking')).toEqual({
      id: 'claude-4.6-sonnet-thinking',
    });
  });
});

describe('parseCursorDigestPayload', () => {
  const ids = ['a1', 'a2'];
  const valid = {
    commentaries: [
      { id: 'a1', commentary: 'Перший коментар про подію в Україні.' },
      { id: 'a2', commentary: 'Другий коментар завершує думку автора.' },
    ],
    digest: '#новини 1. Перший абзац дайджесту з новиною.',
  };

  it('parses raw JSON and maps commentaries by id', () => {
    const parsed = parseCursorDigestPayload(JSON.stringify(valid), ids);
    expect(parsed.digest).toContain('#новини');
    expect(parsed.commentariesById.get('a1')).toContain('Перший');
    expect(parsed.commentariesById.get('a2')).toContain('Другий');
  });

  it('strips markdown fences and leading prose', () => {
    const wrapped = `Here you go.\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\n`;
    const parsed = parseCursorDigestPayload(wrapped, ids);
    expect(parsed.commentariesById.size).toBe(2);
  });

  it('accepts articleId as an alias', () => {
    const alt = {
      commentaries: [{ articleId: 'a1', commentary: 'Текст коментаря.' }],
      digest: '#новини 1. Готовий дайджест.',
    };
    const parsed = parseCursorDigestPayload(JSON.stringify(alt), ['a1']);
    expect(parsed.commentariesById.get('a1')).toBe('Текст коментаря.');
  });

  it('rejects missing article ids and empty digest', () => {
    expect(() => parseCursorDigestPayload(JSON.stringify({
      commentaries: valid.commentaries.slice(0, 1),
      digest: valid.digest,
    }), ids)).toThrow(/missing commentaries/);
    expect(() => parseCursorDigestPayload(JSON.stringify({
      commentaries: valid.commentaries,
      digest: '   ',
    }), ids)).toThrow(/missing digest/);
    expect(() => parseCursorDigestPayload('not json', ids)).toThrow(/not JSON/);
  });
});

describe('buildCursorDigestPrompt', () => {
  it('includes article ids, existing commentary, and assembly rules', () => {
    const prompt = buildCursorDigestPrompt([
      { id: 7, title: 'Title', url: 'https://ex.test', content: 'Body', commentary: 'Already written.' },
    ], {
      commentarySystem: 'COMMENTARY SYSTEM',
      assemblyPrompt: 'ASSEMBLY SYSTEM',
      hashtag: '#новини',
      boundaryIntent: 'DISCLAIMER',
    });
    expect(prompt).toContain('id=7');
    expect(prompt).toContain('Already written.');
    expect(prompt).toContain('COMMENTARY SYSTEM');
    expect(prompt).toContain('ASSEMBLY SYSTEM');
    expect(prompt).toContain('#новини');
    expect(prompt).toContain('DISCLAIMER');
    expect(prompt).toContain('Do not use tools');
    expect(prompt).toContain(CURSOR_TWO_PARAGRAPH_RULES);
    expect(prompt).toContain('exactly 2 short Ukrainian paragraphs');
    expect(prompt).toContain('Paragraph one.\\n\\nParagraph two.');
  });
});

describe('runCursorCloudAgent', () => {
  it('creates a no-repo agent and returns the finished run result', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).endsWith('/v1/models')) {
        return {
          ok: true,
          json: async () => ({ items: [{ id: 'composer-2.5' }, { id: 'grok-4.5' }] }),
        };
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body);
        expect(body.repos).toBeUndefined();
        expect(body.model.id).toBe('composer-2.5');
        expect(body.prompt.text).toContain('digest');
        return {
          ok: true,
          json: async () => ({
            agent: { id: 'bc-1', latestRunId: 'run-1' },
            run: { id: 'run-1', status: 'CREATING' },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          id: 'run-1',
          status: 'FINISHED',
          result: '{"digest":"ok","commentaries":[]}',
          durationMs: 1200,
        }),
      };
    });

    const result = await runCursorCloudAgent({
      apiKey: 'cursor_test',
      modelId: 'composer-2',
      prompt: 'Write the digest JSON',
      fetchImpl,
      sleepImpl: async () => {},
      pollIntervalMs: 1,
    });
    expect(result).toMatchObject({ agentId: 'bc-1', runId: 'run-1' });
    expect(result.result).toContain('digest');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects a missing API key and a failed run', async () => {
    await expect(runCursorCloudAgent({ prompt: 'x' })).rejects.toThrow(/CURSOR_API_KEY/);
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).endsWith('/v1/models')) {
        return { ok: true, json: async () => ({ items: [{ id: 'composer-2.5' }] }) };
      }
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            agent: { id: 'bc-1' },
            run: { id: 'run-1' },
          }),
        };
      }
      return { ok: true, json: async () => ({ status: 'ERROR' }) };
    });
    await expect(runCursorCloudAgent({
      apiKey: 'k',
      prompt: 'x',
      fetchImpl,
      sleepImpl: async () => {},
    })).rejects.toThrow(/ERROR/);
  });
});
