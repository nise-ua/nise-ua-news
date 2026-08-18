import { describe, expect, it } from 'vitest';
import {
  ASSEMBLY_MAX_TOKENS,
  COMMENTARY_MAX_TOKENS,
  completionWasTruncated,
  extractChatCompletionText,
  moonshotExtraBody,
} from './digest-generator.js';

describe('digest commentary token budget', () => {
  it('leaves room for Kimi thinking plus two Ukrainian paragraphs', () => {
    expect(COMMENTARY_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
    expect(ASSEMBLY_MAX_TOKENS).toBeGreaterThanOrEqual(COMMENTARY_MAX_TOKENS);
  });

  it('disables thinking on Kimi K2.6 commentary so max_tokens is not spent on reasoning', () => {
    const extra = moonshotExtraBody('kimi-k2.6', { disableThinking: true });
    expect(extra).toEqual({
      thinking: { type: 'disabled' },
    });
    expect(extra).not.toHaveProperty('extra_body');
    expect(moonshotExtraBody('kimi-k2.7-code', { disableThinking: true })).toBeUndefined();
    expect(moonshotExtraBody('kimi-k2.6', { disableThinking: false })).toBeUndefined();
  });

  it('prefers visible content and flags length truncation', () => {
    const truncated = {
      choices: [{
        finish_reason: 'length',
        message: { content: 'Сорок відсотків рідкісних текстів перетворюються на', reasoning_content: 'plan...' },
      }],
    };
    expect(extractChatCompletionText(truncated)).toBe('Сорок відсотків рідкісних текстів перетворюються на');
    expect(completionWasTruncated(truncated)).toBe(true);
    expect(completionWasTruncated({ choices: [{ finish_reason: 'stop' }] })).toBe(false);
  });
});
