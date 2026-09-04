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

import {
  coverScriptPath,
  getImageJob,
  startImageGeneration,
} from './image-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '../..');

function mockChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('startImageGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BASE_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('spawns the digest-cover CLI and stores image_url from Path: line', async () => {
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const job = startImageGeneration('digest-cover-1');
    expect(job.status).toBe('running');
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [join(PIPELINE_ROOT, 'production/image/src/generate-digest-cover.js'), 'digest-cover-1'],
      expect.objectContaining({ cwd: PIPELINE_ROOT }),
    );
    expect(coverScriptPath()).toContain('generate-digest-cover.js');

    child.stdout.emit('data', Buffer.from('Path: /tmp/out/digest-cover_test.png\n'));
    child.emit('close', 0);

    await vi.waitFor(() => {
      expect(getImageJob(job.id)?.status).toBe('completed');
    });

    const finished = getImageJob(job.id);
    expect(finished).toMatchObject({
      status: 'completed',
      progress: 100,
      imageUrl: 'http://localhost:3000/images/digest-cover_test.png',
      error: null,
    });
    expect(updateDigestMock).toHaveBeenCalledWith('digest-cover-1', {
      image_url: 'http://localhost:3000/images/digest-cover_test.png',
    });
  });

  it('marks job failed when the cover script exits nonzero', async () => {
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const job = startImageGeneration('digest-cover-fail');
    child.stderr.emit('data', Buffer.from('Fatal: OPENROUTER_API_KEY missing in .env\n'));
    child.emit('close', 1);

    await vi.waitFor(() => {
      expect(getImageJob(job.id)?.status).toBe('failed');
    });

    expect(getImageJob(job.id).error).toMatch(/OPENROUTER_API_KEY/);
    expect(updateDigestMock).not.toHaveBeenCalled();
  });

  it('reuses an active running job instead of spawning again', () => {
    const child = mockChild();
    spawnMock.mockReturnValue(child);

    const first = startImageGeneration('digest-cover-active');
    const second = startImageGeneration('digest-cover-active');

    expect(second.id).toBe(first.id);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
