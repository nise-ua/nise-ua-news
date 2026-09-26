import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  FEED_HEADLINE_WORD_MAX,
  FEED_HEADLINE_WORD_MIN,
  HEADLINE_WORD_MAX,
  HEADLINE_WORD_MIN,
  criticSystemPrompt,
  reelCopyPromptRules,
  spokenWordBand,
} from '../reel-copy-contract.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('reel copy contract', () => {
  it('keeps frozen reel headline and spoken facebook bands', () => {
    expect(HEADLINE_WORD_MIN).toBe(6);
    expect(HEADLINE_WORD_MAX).toBe(11);
    expect(spokenWordBand('facebook')).toEqual({ min: 8, max: 12 });
    expect(spokenWordBand('shorts')).toEqual({ min: 18, max: 30 });
    expect(FEED_HEADLINE_WORD_MIN).toBe(5);
    expect(FEED_HEADLINE_WORD_MAX).toBe(8);
  });

  it('interpolates frozen bands into storyboard and critic prompts', () => {
    const rules = reelCopyPromptRules('facebook');
    expect(rules.headline).toBe('6–11');
    const critic = criticSystemPrompt('facebook');
    expect(critic).toContain('6–11');
    expect(critic).toContain('8–12');
    expect(critic).not.toContain('6–10');
    const shorts = criticSystemPrompt('shorts');
    expect(shorts).toContain('18–30');
  });

  it('storyboard and critic source import the contract instead of 6-10 / 5-8 literals', () => {
    const storyboard = readFileSync(join(root, 'production/video/src/storyboard.js'), 'utf8');
    const critic = readFileSync(join(root, 'production/lib/reel-copy-review.js'), 'utf8');
    expect(storyboard).toMatch(/reelCopyPromptRules/);
    expect(storyboard).not.toMatch(/6-10/);
    expect(critic).toMatch(/criticSystemPrompt/);
    expect(critic).not.toMatch(/HEADLINE_WORD_MIN,\s*\n\s*18/);
  });
});
