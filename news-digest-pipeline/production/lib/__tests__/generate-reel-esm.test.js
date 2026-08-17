import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATE_REEL = join(__dirname, '../../video/src/generate-reel.js');
const GENERATE_REEL_HTML = join(__dirname, '../../html-reel/src/generate-reel-html.js');
const STORYBOARD = join(__dirname, '../../video/src/storyboard.js');

describe('generate-reel.js ESM safety', () => {
  const source = readFileSync(GENERATE_REEL, 'utf8');

  it('imports basename from path instead of require("path")', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bbasename\b[^}]*\}\s*from\s*['"]path['"]/);
    expect(source).not.toMatch(/require\(['"]path['"]\)/);
  });

  it('imports normalizeHeadline from reel-ukrainian-copy.js', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bnormalizeHeadline\b[^}]*\}\s*from\s*['"][^'"]*reel-ukrainian-copy\.js['"]/);
  });

  it('does not use bare require() (breaks under "type": "module")', () => {
    // createRequire(...) is fine; bare require('x') throws "require is not defined".
    const bareRequireCalls = [...source.matchAll(/(?<!create)\brequire\s*\(/g)]
      .map((m) => {
        const lineStart = source.lastIndexOf('\n', m.index) + 1;
        const lineEnd = source.indexOf('\n', m.index);
        return source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      })
      .filter((line) => !line.startsWith('//') && !line.includes('createRequire'));

    expect(bareRequireCalls).toEqual([]);
  });

  it('prints Path: then updates digest URLs with basename(finalReelPath)', () => {
    expect(source).toMatch(/console\.log\(`Path: \$\{finalReelPath\}`\)/);
    expect(source).toMatch(/basename\(finalReelPath\)/);
    expect(source).toMatch(/updateDigest\(/);
  });
});

describe('generate-reel-html.js ESM safety', () => {
  const source = readFileSync(GENERATE_REEL_HTML, 'utf8');

  it('imports normalizeHeadline from reel-ukrainian-copy.js', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bnormalizeHeadline\b[^}]*\}\s*from\s*['"][^'"]*reel-ukrainian-copy\.js['"]/);
  });

  it('does not use bare require()', () => {
    const bareRequireCalls = [...source.matchAll(/(?<!create)\brequire\s*\(/g)]
      .map((m) => {
        const lineStart = source.lastIndexOf('\n', m.index) + 1;
        const lineEnd = source.indexOf('\n', m.index);
        return source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      })
      .filter((line) => !line.startsWith('//') && !line.includes('createRequire'));

    expect(bareRequireCalls).toEqual([]);
  });
});

describe('storyboard.js safety', () => {
  const source = readFileSync(STORYBOARD, 'utf8');

  it('imports callLlmJson from llm-backends.js', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bcallLlmJson\b[^}]*\}\s*from\s*['"][^'"]*llm-backends\.js['"]/);
  });
});
