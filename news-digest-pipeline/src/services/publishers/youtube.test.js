import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { insertMock, createReadStreamMock, statSyncMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  createReadStreamMock: vi.fn(() => ({ kind: 'stream' })),
  statSyncMock: vi.fn(() => ({ size: 2048 })),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    youtube: () => ({
      videos: { insert: insertMock },
    }),
  },
}));

vi.mock('fs', () => ({
  createReadStream: createReadStreamMock,
  statSync: statSyncMock,
}));

import { publishToYouTube } from './youtube.js';

describe('publishToYouTube', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'client');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'secret');
    vi.stubEnv('YOUTUBE_REFRESH_TOKEN', 'refresh');
    insertMock.mockResolvedValue({ data: { id: 'yt123' } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('streams the Shorts file with #Shorts-safe metadata and kids=false', async () => {
    const result = await publishToYouTube(
      '/tmp/shorts_1.mp4',
      'NiSeNews · 2026-08-24 #Shorts',
      'Recap\n\n#Shorts #новини',
      'unlisted',
    );

    expect(createReadStreamMock).toHaveBeenCalledWith('/tmp/shorts_1.mp4');
    expect(statSyncMock).toHaveBeenCalledWith('/tmp/shorts_1.mp4');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      requestBody: expect.objectContaining({
        snippet: expect.objectContaining({
          title: 'NiSeNews · 2026-08-24 #Shorts',
          categoryId: '25',
        }),
        status: {
          privacyStatus: 'unlisted',
          selfDeclaredMadeForKids: false,
        },
      }),
      media: { body: { kind: 'stream' } },
    }));
    expect(result).toEqual({
      videoId: 'yt123',
      url: 'https://youtube.com/shorts/yt123',
    });
  });

  it('rejects a missing file path', async () => {
    await expect(publishToYouTube(null, 't', 'd')).rejects.toThrow(/No YouTube Shorts file path/);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
