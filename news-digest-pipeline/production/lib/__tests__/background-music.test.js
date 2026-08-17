import { describe, expect, it } from 'vitest';
import {
  MUSIC_STYLES,
  buildMusicConfig,
  musicSeedFor,
  pickStyleKey,
} from '../../video/src/background-music.js';

describe('reel background music variety', () => {
  it('auto-picks energetic styles, not the slow broadcast pad', () => {
    const styles = new Set();
    for (let i = 0; i < 200; i++) {
      styles.add(pickStyleKey(1_700_000_000_000 + i * 997));
    }
    expect(styles.has('broadcast')).toBe(false);
    expect(styles.has('rush')).toBe(true);
    expect(styles.size).toBeGreaterThanOrEqual(4);
  });

  it('does not reuse the same style for reels a whole minute apart', () => {
    const t0 = 1_713_200_000_000;
    let same = 0;
    for (let i = 0; i < 20; i++) {
      const a = t0 + i * 13_337;
      const b = a + 60_000;
      if (pickStyleKey(a) === pickStyleKey(b)) same += 1;
    }
    expect(same).toBeLessThan(8);
  });

  it('builds a faster bed with a distinct key/tempo per seed', () => {
    const a = buildMusicConfig(42);
    const b = buildMusicConfig(99);
    expect(a.bpm).toBeGreaterThanOrEqual(128);
    expect(MUSIC_STYLES[a.styleKey].bpmOptions[0]).toBeGreaterThanOrEqual(128);
    expect(`${a.styleKey}:${a.bpm}:${a.chords[0].root}`).not.toBe(
      `${b.styleKey}:${b.bpm}:${b.chords[0].root}`
    );
  });

  it('mixes digest id into the music seed', () => {
    expect(musicSeedFor('digest-a', 1_000)).not.toBe(musicSeedFor('digest-b', 1_000));
    expect(musicSeedFor('digest-a', 1_000)).not.toBe(musicSeedFor('digest-a', 61_000));
  });
});
