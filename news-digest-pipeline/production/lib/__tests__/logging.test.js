import { describe, expect, it, vi } from 'vitest';
import { dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { log, projectRoot, scriptDir } from '../logging.js';

describe('log', () => {
  it('emits [HH:MM:SS] message via injectable console/clock', () => {
    const lines = [];
    const fakeConsole = { log: (msg) => lines.push(msg) };
    const now = () => new Date('2026-08-12T21:05:09.123Z');

    log('hello reel', { console: fakeConsole, now });

    expect(lines).toEqual(['[21:05:09] hello reel']);
  });

  it('uses toISOString().slice(11, 19) for the timestamp', () => {
    const fixed = new Date('2020-01-01T00:00:42.999Z');
    expect(fixed.toISOString().slice(11, 19)).toBe('00:00:42');

    const spy = vi.fn();
    log('ts check', { console: { log: spy }, now: () => fixed });
    expect(spy).toHaveBeenCalledWith('[00:00:42] ts check');
  });
});

describe('scriptDir / projectRoot', () => {
  it('scriptDir returns dirname of the file URL', () => {
    const fakeFile = resolve('/tmp/pipeline/production/video/src/generate-reel.js');
    const url = pathToFileURL(fakeFile).href;
    expect(scriptDir(url)).toBe(dirname(fakeFile));
  });

  it('projectRoot from production/*/src/ is three levels up (news-digest-pipeline)', () => {
    // Scripts under production/image|video|audio/src/ historically used:
    //   join(__dirname, '..', '..', '..')
    const scriptPath = resolve(
      '/Users/demo/news-digest-pipeline/production/video/src/generate-reel.js',
    );
    const url = pathToFileURL(scriptPath).href;
    expect(projectRoot(url)).toBe(
      resolve('/Users/demo/news-digest-pipeline'),
    );
    expect(projectRoot(url)).toBe(join(scriptDir(url), '..', '..', '..'));
  });

  it('projectRoot(importMetaUrl, 2) from production/lib/ is pipeline root', () => {
    const libPath = resolve('/Users/demo/news-digest-pipeline/production/lib/logging.js');
    const url = pathToFileURL(libPath).href;
    expect(projectRoot(url, 2)).toBe(resolve('/Users/demo/news-digest-pipeline'));
  });
});
