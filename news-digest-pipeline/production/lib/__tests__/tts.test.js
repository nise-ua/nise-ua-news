import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import {
  EDGE_VOICE,
  completeClause,
  generatePerArticleAudio,
  getAudioDuration,
  normalizeAudioToReel,
  synthesizeEdgeTts,
  synthesizeElevenLabs,
} from '../tts.js';
import { mockExecFileSync, mockFetchResponses, unstubGlobals, withEnv } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('completeClause', () => {
  it('finishes unfinished text with a period', () => {
    expect(completeClause('Новина без крапки')).toBe('Новина без крапки.');
  });

  it('keeps a finished sentence as-is', () => {
    expect(completeClause('Готове речення.')).toBe('Готове речення.');
  });

  it('respects maxWords across sentences', () => {
    const result = completeClause('Один два три. Чотири пять шість. Сім вісім.', 4, 200);
    expect(result).toBe('Один два три.');
  });
});

describe('getAudioDuration', () => {
  it('parses ffprobe mock output', () => {
    const execFileSync = mockExecFileSync({ defaultReturn: '3.250\n' });
    const duration = getAudioDuration('/tmp/a.mp3', {
      execFileSync,
      ffprobePath: '/mock/ffprobe',
    });
    expect(duration).toBe(3.25);
    expect(execFileSync).toHaveBeenCalledWith(
      '/mock/ffprobe',
      expect.arrayContaining(['-show_entries', 'format=duration', '/tmp/a.mp3']),
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });
});

describe('EDGE_VOICE', () => {
  it('defaults to uk-UA-PolinaNeural', () => {
    expect(EDGE_VOICE).toMatch(/^uk-UA-/);
  });
});

describe('synthesizeEdgeTts', () => {
  it('runs uvx edge-tts with text and voice', () => {
    const execFileSync = mockExecFileSync();
    synthesizeEdgeTts('Привіт', '/tmp/out.mp3', {
      voice: 'uk-UA-OstapNeural',
      execFileSync,
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'uvx',
      [
        'edge-tts',
        '--text=Привіт',
        '--voice=uk-UA-OstapNeural',
        '--write-media=/tmp/out.mp3',
      ],
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });
});

describe('synthesizeElevenLabs', () => {
  it('writes audio on ok response and returns true', async () => {
    const fetchFn = mockFetchResponses([{ status: 200, body: 'audio-bytes' }]);
    const writeFileSync = vi.fn();
    const ok = await synthesizeElevenLabs('Текст', '/tmp/el.mp3', {
      apiKey: 'key',
      voiceId: 'voice-uk',
      fetchFn,
      writeFileSync,
    });
    expect(ok).toBe(true);
    expect(writeFileSync).toHaveBeenCalledWith('/tmp/el.mp3', expect.any(Buffer));
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/text-to-speech/voice-uk',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns false on non-ok response', async () => {
    const fetchFn = mockFetchResponses([{ status: 500, body: 'fail' }]);
    const writeFileSync = vi.fn();
    const ok = await synthesizeElevenLabs('Текст', '/tmp/el.mp3', {
      apiKey: 'key',
      voiceId: 'voice-uk',
      fetchFn,
      writeFileSync,
    });
    expect(ok).toBe(false);
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});

describe('normalizeAudioToReel', () => {
  it('includes 48000 and libmp3lame in ffmpeg command', () => {
    const execFileSync = mockExecFileSync();
    normalizeAudioToReel('/tmp/in.mp3', '/tmp/out.mp3', {
      execFileSync,
      ffmpegPath: '/mock/ffmpeg',
    });
    const [, args] = execFileSync.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(['-ar', '48000', '-codec:a', 'libmp3lame']));
    expect(args).toContain('/tmp/in.mp3');
    expect(args).toContain('/tmp/out.mp3');
  });
});

describe('generatePerArticleAudio', () => {
  function buildExecMock() {
    return mockExecFileSync({
      impl: (cmd, args) => {
        if (String(cmd).includes('ffprobe') || args?.includes('-show_entries')) {
          return '2.5\n';
        }
        return '';
      },
    });
  }

  it('falls back to edge-tts when ElevenLabs env is set but fetch is non-ok', async () => {
    const restore = withEnv({
      ELEVENLABS_API_KEY: 'el-key',
      ELEVENLABS_UKRAINIAN_VOICE_ID: 'uk-voice',
    });
    try {
      const execFileSync = buildExecMock();
      const fetchFn = mockFetchResponses([{ status: 503, body: 'nope' }]);
      const writeFileSync = vi.fn();
      const log = vi.fn();

      const results = await generatePerArticleAudio(
        [{ spokenText: 'Перша новина.', headline: 'H1' }],
        '/tmp/tts-test',
        { execFileSync, fetchFn, writeFileSync, ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', log },
      );

      expect(results).toHaveLength(1);
      expect(results[0].duration).toBe(2.5);
      const uvxCalls = execFileSync.mock.calls.filter((c) => c[0] === 'uvx');
      expect(uvxCalls.length).toBeGreaterThanOrEqual(1);
      expect(uvxCalls[0][1]).toEqual(
        expect.arrayContaining(['edge-tts', expect.stringMatching(/^--text=/)]),
      );
    } finally {
      restore();
    }
  });

  it('uses only edge-tts when no ElevenLabs key', async () => {
    const restore = withEnv({
      ELEVENLABS_API_KEY: undefined,
      ELEVENLABS_UKRAINIAN_VOICE_ID: undefined,
    });
    try {
      const execFileSync = buildExecMock();
      const fetchFn = vi.fn();
      const writeFileSync = vi.fn();

      await generatePerArticleAudio(
        [{ spokenText: 'Тільки edge.', headline: 'H' }],
        '/tmp/tts-test',
        { execFileSync, fetchFn, writeFileSync, ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', log: () => {} },
      );

      expect(fetchFn).not.toHaveBeenCalled();
      expect(execFileSync.mock.calls.some((c) => c[0] === 'uvx')).toBe(true);
    } finally {
      restore();
    }
  });

  it('returns paths and durations for 2 shots and applies prepareTtsText', async () => {
    const restore = withEnv({
      ELEVENLABS_API_KEY: undefined,
      ELEVENLABS_UKRAINIAN_VOICE_ID: undefined,
    });
    try {
      const execFileSync = buildExecMock();
      const results = await generatePerArticleAudio(
        [
          { spokenText: 'Cloudflare заблокував атаку', headline: 'H1' },
          { spokenText: 'Друга новина сьогодні', headline: 'H2' },
        ],
        '/tmp/tts-two',
        {
          execFileSync,
          fetchFn: vi.fn(),
          writeFileSync: vi.fn(),
          ffmpeg: '/mock/ffmpeg',
          ffprobe: '/mock/ffprobe',
          log: () => {},
        },
      );

      expect(results).toHaveLength(2);
      expect(results[0].audioPath).toBe(join('/tmp/tts-two', 'audio_shot_1.mp3'));
      expect(results[1].audioPath).toBe(join('/tmp/tts-two', 'audio_shot_2.mp3'));
      expect(results.every((r) => r.duration === 2.5)).toBe(true);

      const textArgs = execFileSync.mock.calls
        .filter((c) => c[0] === 'uvx')
        .map((c) => c[1].find((a) => String(a).startsWith('--text=')));
      expect(textArgs[0]).toContain('Клоудфлейр');
      expect(textArgs[0]).not.toMatch(/--text=Cloudflare/i);

      const normalizeCall = execFileSync.mock.calls.find(
        (c) => c[0] === '/mock/ffmpeg' && c[1].includes('48000') && c[1].includes('libmp3lame'),
      );
      expect(normalizeCall).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('prefers ElevenLabs when key and Ukrainian voice id are set', async () => {
    const restore = withEnv({
      ELEVENLABS_API_KEY: 'el-key',
      ELEVENLABS_UKRAINIAN_VOICE_ID: 'uk-voice',
    });
    try {
      const execFileSync = buildExecMock();
      const fetchFn = mockFetchResponses([{ status: 200, body: 'ok-audio' }]);
      const writeFileSync = vi.fn();

      await generatePerArticleAudio(
        [{ spokenText: 'Успішний ElevenLabs.', headline: 'H' }],
        '/tmp/tts-el',
        { execFileSync, fetchFn, writeFileSync, ffmpeg: '/mock/ffmpeg', ffprobe: '/mock/ffprobe', log: () => {} },
      );

      expect(fetchFn).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalled();
      expect(execFileSync.mock.calls.some((c) => c[0] === 'uvx')).toBe(false);
    } finally {
      restore();
    }
  });
});
