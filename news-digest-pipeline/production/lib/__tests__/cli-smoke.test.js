import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

describe('CLI Entrypoint Syntax and Module Loading Smoke Tests', () => {
  it('node --check validates production/video/src/generate-reel.js syntax and imports without throwing', () => {
    const scriptPath = join(ROOT, 'production/video/src/generate-reel.js');
    const result = spawnSync('node', ['--check', scriptPath], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('node --check validates production/html-reel/src/generate-reel-html.js syntax and imports without throwing', () => {
    const scriptPath = join(ROOT, 'production/html-reel/src/generate-reel-html.js');
    const result = spawnSync('node', ['--check', scriptPath], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('node --check validates production/lib/llm-backends.js', () => {
    const scriptPath = join(ROOT, 'production/lib/llm-backends.js');
    const result = spawnSync('node', ['--check', scriptPath], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('node --check validates production/lib/image-backends.js', () => {
    const scriptPath = join(ROOT, 'production/lib/image-backends.js');
    const result = spawnSync('node', ['--check', scriptPath], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
