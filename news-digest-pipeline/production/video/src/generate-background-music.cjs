#!/usr/bin/env node
/**
 * CLI: regenerate the default assets/background-music.mp3 bed.
 *
 * Usage:
 *   node production/video/src/generate-background-music.cjs
 *   node production/video/src/generate-background-music.cjs --seed 42
 *   node production/video/src/generate-background-music.cjs --duration 90
 */
const { join } = require('path');

async function main() {
  const { generateBackgroundMusic, defaultAssetPath, DEFAULT_MUSIC_DURATION_SEC } = await import('./background-music.js');
  const seedArg = process.argv.find((arg, i) => process.argv[i - 1] === '--seed');
  const durationArg = process.argv.find((arg, i) => process.argv[i - 1] === '--duration');
  const seed = seedArg != null ? Number(seedArg) : Date.now();
  const parsedDuration = durationArg != null ? Number(durationArg) : NaN;
  const duration = Number.isFinite(parsedDuration) && parsedDuration > 0
    ? parsedDuration
    : DEFAULT_MUSIC_DURATION_SEC;
  const outputPath = defaultAssetPath();

  const { config } = generateBackgroundMusic({ seed, outputPath, duration });
  console.log(`Done: ${outputPath}`);
  console.log(`  style=${config.styleLabel}  seed=${config.seed}  bpm=${config.bpm}  duration=${duration}s`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
