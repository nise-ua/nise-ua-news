import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMusicMixFilter,
  getAudioDuration,
  getMediaDuration,
  getVideoDuration,
  mergeAudioWithVideo,
  mergeShotVideoAndAudio,
  runMusicMix,
} from '../ffmpeg-helpers.js';
import { mockExecFileSync, unstubGlobals } from './helpers.js';

afterEach(() => {
  unstubGlobals();
});

describe('getMediaDuration / aliases', () => {
  it('parses ffprobe mock output', () => {
    const execFileSync = mockExecFileSync({ defaultReturn: '4.125\n' });
    const duration = getMediaDuration('/tmp/clip.mp4', {
      execFileSync,
      ffprobePath: '/mock/ffprobe',
    });
    expect(duration).toBe(4.125);
    expect(execFileSync).toHaveBeenCalledWith(
      '/mock/ffprobe',
      expect.arrayContaining(['-show_entries', 'format=duration', '/tmp/clip.mp4']),
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });

  it('getAudioDuration and getVideoDuration alias getMediaDuration', () => {
    const execFileSync = mockExecFileSync({ defaultReturn: '2.0\n' });
    expect(getAudioDuration('/tmp/a.mp3', { execFileSync, ffprobePath: '/mock/ffprobe' })).toBe(2);
    expect(getVideoDuration('/tmp/v.mp4', { execFileSync, ffprobePath: '/mock/ffprobe' })).toBe(2);
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });
});

describe('buildMusicMixFilter', () => {
  it('defaults music post volume to 0.8', () => {
    const filter = buildMusicMixFilter(null);
    expect(filter).toContain('volume=0.8[music]');
    expect(filter).toContain('loudnorm=I=-16:TP=-1.5:LRA=11');
    expect(filter).toContain('amix=inputs=2:duration=first:dropout_transition=3:normalize=0');
    expect(filter).toContain('alimiter=limit=0.95[aout]');
    expect(filter).toMatch(/\[0:a\].*\[voice\]/);
    expect(filter).toMatch(/\[1:a\].*\[music\]/);
  });

  it('uses custom music post volume', () => {
    expect(buildMusicMixFilter(0.35)).toContain('volume=0.35[music]');
  });
});

describe('mergeShotVideoAndAudio', () => {
  it('invokes ffmpeg with map / copy / aac / 48000 / shortest', () => {
    const execFileSync = mockExecFileSync();
    const out = mergeShotVideoAndAudio('/tmp/v.mp4', '/tmp/a.mp3', '/tmp/out.mp4', {
      execFileSync,
      ffmpegPath: '/mock/ffmpeg',
    });
    expect(out).toBe('/tmp/out.mp4');
    const [cmd, args] = execFileSync.mock.calls[0];
    expect(cmd).toBe('/mock/ffmpeg');
    expect(args).toEqual(expect.arrayContaining([
      '-y',
      '-i', '/tmp/v.mp4',
      '-i', '/tmp/a.mp3',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      '-shortest',
      '/tmp/out.mp4',
    ]));
  });
});

describe('mergeAudioWithVideo', () => {
  it('behaves like mergeShotVideoAndAudio when files exist', () => {
    const execFileSync = mockExecFileSync();
    const existsSync = vi.fn(() => true);
    const mkdirSync = vi.fn();
    const out = mergeAudioWithVideo('/tmp/v.mp4', '/tmp/a.mp3', '/tmp/merged.mp4', {
      execFileSync,
      ffmpegPath: '/mock/ffmpeg',
      existsSync,
      mkdirSync,
      log: () => {},
    });
    expect(out).toBe('/tmp/merged.mp4');
    const [, args] = execFileSync.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
    ]));
  });

  it('throws when video or audio is missing', () => {
    const existsSync = vi.fn((p) => p !== '/tmp/missing.mp4');
    expect(() => mergeAudioWithVideo('/tmp/missing.mp4', '/tmp/a.mp3', '/tmp/out.mp4', {
      existsSync,
      execFileSync: mockExecFileSync(),
      mkdirSync: vi.fn(),
      log: () => {},
    })).toThrow(/Video file not found/);
  });
});

describe('runMusicMix', () => {
  it('loops music and applies filter_complex', () => {
    const execFileSync = mockExecFileSync();
    const out = runMusicMix('/tmp/voice.mp3', '/tmp/music.mp3', '/tmp/mix.m4a', 0.35, {
      execFileSync,
      ffmpegPath: '/mock/ffmpeg',
    });
    expect(out).toBe('/tmp/mix.m4a');
    const [, args] = execFileSync.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([
      '-stream_loop', '-1',
      '-filter_complex',
      '-map', '[aout]',
      '-shortest',
    ]));
    const filterIdx = args.indexOf('-filter_complex');
    expect(args[filterIdx + 1]).toContain('volume=0.35[music]');
    expect(args[filterIdx + 1]).toContain('loudnorm');
    expect(args[filterIdx + 1]).toContain('normalize=0');
  });
});
