import { describe, expect, it } from 'vitest';
import { summarizeCliFailure } from './cli-failure.js';

const copyReviewStderr = `Fatal: Reel copy review could not finish in-band copy.
Final copy for review:
  Shot 1
    headline (6w): Найдешевший спосіб прив'язати людей до екосистеми.
    detail   (0w):
    spoken   (6w): Найдешевший спосіб прив'язати людей до екосистеми.
    issues: detailText is missing
  Shot 2
    headline (8w): А може просто знову продають вічну молодість пачками.
    detail   (0w):
    spoken   (8w): А може просто знову продають вічну молодість пачками.
    issues: detailText is missing
  Shot 3
    headline (9w): GPT-6 Astra за добу пройшла Portal.
    detail   (12w): Гра стояла на паузі, модель гадала над скриншотами, злетіло 3336 викликів інструментів.
    spoken   (9w): GPT-6 Astra за добу пройшла Portal.
    issues: none`;

describe('summarizeCliFailure', () => {
  it('does not surface issues: none from a copy-review table', () => {
    const message = summarizeCliFailure(copyReviewStderr, '', 'Відеопайплайн завершився з кодом 1');
    expect(message).not.toMatch(/issues:\s*none/i);
    expect(message).toMatch(/Reel copy review could not finish in-band copy/);
    expect(message).toMatch(/Shot 1: detailText is missing/);
    expect(message).toMatch(/Shot 2: detailText is missing/);
  });

  it('keeps a one-line Fatal error', () => {
    expect(summarizeCliFailure('Fatal: require is not defined\n', '')).toMatch(/require is not defined/);
  });

  it('humanizes bare fetch failed errors for the dashboard', () => {
    expect(summarizeCliFailure('Fatal: fetch failed\n', '')).toMatch(/Мережева помилка/);
  });

  it('humanizes Cloudflare ENOTFOUND errors for the dashboard', () => {
    expect(summarizeCliFailure(
      'Fatal: Cloudflare Workers AI image: network error (ENOTFOUND)\n',
      '',
    )).toMatch(/Мережева помилка/);
  });

  it('skips the Node.js version banner and keeps the syntax error', () => {
    const message = summarizeCliFailure(
      'file:///app/production/image/src/generate-digest-cover.js:71\nSyntaxError: Identifier \'completeJson\' has already been declared\n    at ModuleJob.run (node:internal/modules/esm/module_job:413:25)\nNode.js v20.20.2\n',
      '',
    );
    expect(message).toMatch(/SyntaxError: Identifier 'completeJson'/);
    expect(message).not.toMatch(/^Node\.js v/);
  });

  it('does not duplicate shot issues already on the Fatal line', () => {
    const message = summarizeCliFailure(
      'Fatal: Reel copy review could not finish in-band copy. Shot 1: detailText is missing\n    issues: detailText is missing\n    issues: none\n',
      '',
    );
    expect(message).toBe('Reel copy review could not finish in-band copy. Shot 1: detailText is missing');
  });
});
