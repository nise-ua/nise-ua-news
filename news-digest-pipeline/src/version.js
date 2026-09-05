import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readVersion() {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || null;
  } catch {
    return null;
  }
}

// Docker images usually ship without .git, so allow the build to inject the date.
function readBuildDate() {
  if (process.env.BUILD_DATE) return process.env.BUILD_DATE;
  try {
    return execSync('git log -1 --format=%cs', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null;
  } catch {
    return null;
  }
}

export const appVersion = readVersion();
export const appBuildDate = readBuildDate();
