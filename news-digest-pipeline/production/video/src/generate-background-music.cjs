#!/usr/bin/env node
/**
 * CLI: regenerate the default assets/background-music.mp3 bed.
 *
 * Usage:
 *   node production/video/src/generate-background-music.cjs
 *   node production/video/src/generate-background-music.cjs --seed 42
 */
const { join } = require('path');

async function main() {
  const { generateBackgroundMusic, defaultAssetPath } = await import('./background-music.js');
  const seedArg = process.argv.find((arg, i) => process.argv[i - 1] === '--seed');
  const seed = seedArg != null ? Number(seedArg) : Date.now();
  const outputPath = defaultAssetPath();

  const { config } = generateBackgroundMusic({ seed, outputPath });
  console.log(`Done: ${outputPath}`);
  console.log(`  style=${config.styleLabel}  seed=${config.seed}  bpm=${config.bpm}  duration=36s`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
