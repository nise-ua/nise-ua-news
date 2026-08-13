import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { getVideoJob, startVideoGeneration } from './video-generator.js';

function mockChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('startVideoGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BASE_URL', 'http://localhost:3000');
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
    });
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
