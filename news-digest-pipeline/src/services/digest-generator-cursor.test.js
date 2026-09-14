import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({
  updateArticleStatus: vi.fn(),
  updateArticleCommentary: vi.fn(),
  createDigest: vi.fn(() => 'digest-1'),
  updateDigest: vi.fn(),
  assignArticlesToDigest: vi.fn(),
  getDigests: vi.fn(() => []),
  getDigest: vi.fn(() => ({
    content: `#новини 1. ${'абзац дайджесту '.repeat(20)}`,
  })),
  getDb: vi.fn(() => ({
    prepare: () => ({ run: vi.fn() }),
  })),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

vi.mock('./image-generator.js', () => ({
  startImageGeneration: vi.fn(() => ({ id: 'job-1' })),
}));

import { generateDigest } from './digest-generator.js';
import {
  assignArticlesToDigest,
  createDigest,
  updateArticleCommentary,
  updateArticleStatus,
} from '../db/index.js';

describe('generateDigest cursor vendor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a single Cloud Agent and stores commentaries plus digest', async () => {
    const cursorAgentRun = vi.fn(async () => ({
      agentId: 'bc-test',
      runId: 'run-test',
      durationMs: 50,
      result: JSON.stringify({
        commentaries: [
          { id: '11', commentary: 'Авторський коментар до першої новини.' },
          { id: '12', commentary: 'Авторський коментар до другої новини.' },
        ],
        digest: `#новини 1. Перший абзац. ${'текст '.repeat(30)}`,
      }),
    }));

    const articles = [
      { id: 11, title: 'One', url: 'https://a.test', content: 'Body one' },
      { id: 12, title: 'Two', url: 'https://b.test', content: 'Body two' },
    ];
    const digestId = await generateDigest({}, articles, {
      llmVendor: 'cursor',
      cursorApiKey: 'cursor_test',
      llmModel: 'composer-2',
      commentaryPrompt: 'Be sarcastic.',
      assemblyPrompt: 'Assemble.',
      hashtag: '#новини',
      cursorAgentRun,
    });

    expect(digestId).toBe('digest-1');
    expect(cursorAgentRun).toHaveBeenCalledTimes(1);
    expect(cursorAgentRun.mock.calls[0][0].prompt).toContain('id=11');
    expect(updateArticleStatus).toHaveBeenCalled();
    expect(updateArticleCommentary).toHaveBeenCalledTimes(2);
    expect(createDigest).toHaveBeenCalled();
    expect(assignArticlesToDigest).toHaveBeenCalledWith([11, 12], 'digest-1');
  });

  it('does not call the Cursor agent for other vendors', async () => {
    const cursorAgentRun = vi.fn();
    await expect(generateDigest({}, [{ id: 1, content: 'x' }], {
      llmVendor: 'openai',
      openaiApiKey: '',
      llmModel: 'gpt-5.4-mini',
      commentaryPrompt: 'c',
      assemblyPrompt: 'a',
      cursorAgentRun,
    })).rejects.toThrow();
    expect(cursorAgentRun).not.toHaveBeenCalled();
  });
});
