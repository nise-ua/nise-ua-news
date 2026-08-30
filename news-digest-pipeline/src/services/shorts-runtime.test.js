import { describe, expect, it } from 'vitest';
import { planShortsRuntime, SHORTS_INTRO_OUTRO_SEC, SHORTS_PAD_SEC } from '../../production/video/src/shorts-runtime.js';

describe('planShortsRuntime', () => {
  it('keeps intro/outro and pads when under 180s', () => {
    const plan = planShortsRuntime([14, 14, 14, 14, 14]);
    expect(plan.introOutroSec).toBe(SHORTS_INTRO_OUTRO_SEC);
    expect(plan.padSec).toBe(SHORTS_PAD_SEC);
    expect(plan.projectedSec).toBeCloseTo(70 + 5 * SHORTS_PAD_SEC + 10, 5);
  });

  it('drops intro/outro before shrinking pads', () => {
    const plan = planShortsRuntime([32, 32, 32, 32, 32]);
    expect(plan.introOutroSec).toBe(0);
    expect(plan.padSec).toBe(SHORTS_PAD_SEC);
    expect(plan.projectedSec).toBeCloseTo(160 + 5 * SHORTS_PAD_SEC, 5);
  });

  it('shrinks pads when shots plus pads still exceed 180s', () => {
    const plan = planShortsRuntime(Array(17).fill(10));
    expect(plan.introOutroSec).toBe(0);
    expect(plan.padSec).toBeCloseTo(10 / 17, 5);
    expect(plan.projectedSec).toBeCloseTo(180, 5);
  });

  it('does not drop shots when voiceover already exceeds 180s', () => {
    const plan = planShortsRuntime(Array(17).fill(12));
    expect(plan.introOutroSec).toBe(0);
    expect(plan.padSec).toBe(0);
    expect(plan.projectedSec).toBe(204);
  });
});
