/** YouTube Shorts hard cap. Do not subset digest blocks to fit. */
export const SHORTS_MAX_SEC = 180;
export const SHORTS_INTRO_OUTRO_SEC = 5;
export const SHORTS_PAD_SEC = 2.25;

/**
 * Fit intro/outro and per-shot music pads under the Shorts duration cap.
 * Drop intro/outro first, then shrink pads. Never merge or drop shots.
 *
 * @param {number[]} shotDurations TTS (or fallback) seconds per shot, before pads
 */
export function planShortsRuntime(shotDurations, {
  maxSec = SHORTS_MAX_SEC,
  introOutroSec = SHORTS_INTRO_OUTRO_SEC,
  padSec = SHORTS_PAD_SEC,
} = {}) {
  const shots = (shotDurations || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  const n = shots.length;
  const shotSum = shots.reduce((sum, d) => sum + d, 0);

  let intro = n > 0 ? introOutroSec : 0;
  let pad = n > 0 ? padSec : 0;

  const projected = () => shotSum + n * pad + intro * 2;

  if (projected() > maxSec) {
    intro = 0;
  }
  if (projected() > maxSec && n > 0) {
    pad = Math.max(0, (maxSec - shotSum) / n);
  }

  return {
    introOutroSec: intro,
    padSec: pad,
    projectedSec: projected(),
  };
}
