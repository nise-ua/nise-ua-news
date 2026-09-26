/**
 * Turn CLI stdout/stderr into a UI-safe error. Reel copy review prints a
 * multi-line table whose last row is often `issues: none`.
 */
const ISSUE_NONE = /^issues:\s*none$/i;
const NOISE_LINE = /^(shot\s+\d+|headline\b|detail\b|spoken\b|final copy for review:|node\.js v\d|at\s+)/i;

function humanizeFetchFailure(text) {
  const trimmed = String(text || '').trim();
  if (/^fetch failed$/i.test(trimmed)
    || /\bnetwork error\b/i.test(trimmed)
    || /\b(enotfound|econnrefused|etimedout|econnreset)\b/i.test(trimmed)) {
    return 'Мережева помилка з’єднання з API зображень. Спробуйте ще раз через кілька секунд.';
  }
  return trimmed;
}

export function summarizeCliFailure(stderr = '', stdout = '', fallback = 'Command failed') {
  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[^\]]+\]\s*/, '').trim())
    .filter(Boolean);
  const fatalIdx = lines.findIndex((line) => /^Fatal:/i.test(line));
  const slice = fatalIdx >= 0 ? lines.slice(fatalIdx) : lines;
  const fatal = fatalIdx >= 0
    ? slice[0].replace(/^Fatal:\s*/i, '').trim()
    : '';
  const shotIssues = [];
  let shot = null;
  for (const line of slice) {
    const shotMatch = line.match(/^Shot\s+(\d+)/i);
    if (shotMatch) shot = shotMatch[1];
    const issueMatch = line.match(/^issues:\s*(.+)$/i);
    if (issueMatch && !/^none$/i.test(issueMatch[1].trim())) {
      shotIssues.push(shot ? `Shot ${shot}: ${issueMatch[1].trim()}` : issueMatch[1].trim());
    }
  }
  const fatalHead = humanizeFetchFailure(fatal.split(/\n/)[0].trim());
  if (fatalHead && /Shot\s+\d+:/i.test(fatalHead)) return fatalHead;
  const combined = [fatalHead, ...shotIssues].filter(Boolean);
  if (combined.length) return combined.join(' ');
  const meaningful = [...lines].reverse().find((line) => (
    line && !ISSUE_NONE.test(line) && !NOISE_LINE.test(line)
  ));
  const text = humanizeFetchFailure(combined.length ? combined.join(' ') : (meaningful || fallback));
  return text.length > 800 ? `${text.slice(0, 799)}…` : text;
}
