import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { spawnMock, updateDigestMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  updateDigestMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('../db/index.js', () => ({
  updateDigest: updateDigestMock,
}));

vi.mock('../config.js', () => ({
  default: { reelFrameMode: 'ai' },
  normalizeReelFrameMode: (value) => {
    const mode = String(value || 'ai').trim().toLowerCase();
    return mode === 'html' ? 'html' : 'ai';
  },
}));

import config from '../config.js';
import {
  getVideoJob,
  resolveReelScript,
  startVideoGeneration,
} from './video-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '../..');

function mockChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('resolveReelScript', () => {
  it('points at generate-reel.js for ai mode', () => {
    const resolved = resolveReelScript('ai');
    expect(resolved.mode).toBe('ai');
    expect(resolved.scriptPath).toContain(`${join('production', 'video', 'src', 'generate-reel.js')}`);
  });

  it('points at generate-reel-html.js for html mode', () => {
    const resolved = resolveReelScript('html');
    expect(resolved.mode).toBe('html');
    expect(resolved.scriptPath).toContain(`${join('production', 'html-reel', 'src', 'generate-reel-html.js')}`);
  });
});

describe('startVideoGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BASE_URL', 'http://localhost:3000');
    config.reelFrameMode = 'ai';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks job completed (not done) and stores video URLs from Path: line', async () => {
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const job = startVideoGeneration('digest-abc');
    expect(job.status).toBe('running');
    expect(job.status).not.toBe('done');
    expect(job.reelFrameMode).toBe('ai');
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [join(PIPELINE_ROOT, 'production/video/src/generate-reel.js'), 'digest-abc'],
      expect.objectContaining({ cwd: PIPELINE_ROOT }),
    );

    child.stdout.emit('data', Buffer.from('Path: /tmp/out/reel_test.mp4\n'));
    child.emit('close', 0);

    await vi.waitFor(() => {
      expect(getVideoJob(job.id)?.status).toBe('completed');
    });

    const finished = getVideoJob(job.id);
    expect(finished).toMatchObject({
      status: 'completed',
      stage: 'completed',
      progress: 100,
      videoUrl: 'http://localhost:3000/videos/reel_test.mp4',
      error: null,
    });
    expect(finished.status).not.toBe('done');
    expect(updateDigestMock).toHaveBeenCalledWith('digest-abc', {
      video_url: 'http://localhost:3000/videos/reel_test.mp4',
      reel_url: 'http://localhost:3000/reels/reel_test.mp4',
      video_cost_usd: 0,
    });
  });

  it('spawns the HTML hybrid script when reelFrameMode=html', () => {
    config.reelFrameMode = 'html';
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const job = startVideoGeneration('digest-html');
    expect(job.reelFrameMode).toBe('html');
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [join(PIPELINE_ROOT, 'production/html-reel/src/generate-reel-html.js'), 'digest-html'],
      expect.objectContaining({ cwd: PIPELINE_ROOT }),
    );
  });

  it('passes --format shorts when requested', () => {
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const job = startVideoGeneration('digest-shorts', { format: 'shorts' });
    expect(job.format).toBe('shorts');
    expect(spawnMock.mock.calls[0][1]).toEqual([
      join(PIPELINE_ROOT, 'production/video/src/generate-reel.js'),
      'digest-shorts',
      '--format',
      'shorts',
    ]);
  });

  it('marks job failed when the reel script exits with require is not defined', async () => {
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const job = startVideoGeneration('digest-esm-bug');
    child.stderr.emit('data', Buffer.from('Fatal: require is not defined\n'));
    child.emit('close', 1);

    await vi.waitFor(() => {
      expect(getVideoJob(job.id)?.status).toBe('failed');
    });

    const finished = getVideoJob(job.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toMatch(/require is not defined/);
    expect(finished.videoUrl).toBeNull();
    expect(updateDigestMock).not.toHaveBeenCalled();
  });

  it('reuses an active running job instead of spawning again', () => {
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const first = startVideoGeneration('digest-active');
    const second = startVideoGeneration('digest-active');

    expect(second.id).toBe(first.id);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
