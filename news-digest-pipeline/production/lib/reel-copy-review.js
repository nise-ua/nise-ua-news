/**
 * Agentic overlay-copy review: heuristic fails + LLM critic/rewrite.
 * Frozen bands stay in reel-ukrainian-copy.js; this loop only replaces
 * headline / detailText / spokenText.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { completeCloudflareJson, shouldPreferCloudflareLlm } from './cloudflare-llm.js';
import {
  DETAIL_HARD_MAX,
  DETAIL_WORD_MAX,
  DETAIL_WORD_MIN,
  HEADLINE_WORD_MAX,
  HEADLINE_WORD_MIN,
  assertFinishedReelCopy,
  countWords,
  ensureUkrainianOnScreenCopy,
  hasCyrillic,
  looksUnfinishedSentence,
  splicesTwoThoughts,
} from './reel-ukrainian-copy.js';

export const COPY_REVIEW_MAX_ROUNDS = 3;

export class ReelCopyReviewError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReelCopyReviewError';
  }
}

const STUB_HEADLINE_RE = /^(класика|історія|революція|цікаво|ага|ну що|оце так)[.!?…]*$/iu;
const SARCASTIC_LEAD_IN_RE = /^(знову\s+революція|оце так історія|ну що,|ага,)/iu;

const COPY_FIELDS = ['headline', 'detailText', 'spokenText'];

function sentenceCount(text) {
  return String(text || '').trim().split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

/**
 * Deterministic overlay issues. Empty array means heuristics passed.
 * @param {object} shot
 * @returns {string[]}
 */
export function findCopyIssues(shot = {}) {
  const issues = [];
  const headline = String(shot.headline || '').trim();
  const detail = String(shot.detailText || '').trim();
  const spoken = String(shot.spokenText || '').trim();

  if (!headline) {
    issues.push('headline is missing');
  } else {
    if (looksUnfinishedSentence(headline)) issues.push('headline is unfinished');
    const words = countWords(headline);
    if (words < HEADLINE_WORD_MIN || words > HEADLINE_WORD_MAX) {
      issues.push(`headline is out of band (${words} words)`);
    }
    if (STUB_HEADLINE_RE.test(headline) || words < HEADLINE_WORD_MIN) {
      issues.push('headline is a stub, not a finished news sentence');
    }
    if (splicesTwoThoughts(headline)) {
      issues.push('headline splices two thoughts with a dash or semicolon');
    }
    if (SARCASTIC_LEAD_IN_RE.test(headline)) {
      issues.push('headline is a sarcastic lead-in, not the fact');
    }
  }

  if (!detail) {
    issues.push('detailText is missing');
  } else {
    if (looksUnfinishedSentence(detail)) issues.push('detailText is unfinished');
    if (sentenceCount(detail) > 1) issues.push('detailText must be one sentence');
    const words = countWords(detail);
    if (words < DETAIL_WORD_MIN || words > DETAIL_WORD_MAX) {
      issues.push(`detailText is out of band (${words} words)`);
    }
    if (words > DETAIL_HARD_MAX) {
      issues.push(`detailText is too long (${words} words)`);
    }
    if (splicesTwoThoughts(detail)) {
      issues.push('detailText splices two thoughts with a dash or semicolon');
    }
  }

  if (spoken && looksUnfinishedSentence(spoken)) {
    issues.push('spokenText is unfinished');
  }

  const unique = [...new Set(issues)];
  return unique;
}

/**
 * Strip sarcastic one-beat openers so fallback/repair can use the actual news.
 */
export function stripSarcasticLeadIn(text) {
  let result = String(text || '').trim();
  const patterns = [
    /^\s*класика[.!?…]?\s*/iu,
    /^\s*історія[.!?…]?\s*/iu,
    /^\s*революція[.!?…]?\s*/iu,
    /^\s*цікаво[.!?…]?\s*/iu,
    /^\s*ну що,?\s*/iu,
    /^\s*знову\s*[«"']?революція[»"']?\s*\??\s*/iu,
    /^\s*оце так історія\.?\s*/iu,
    /^\s*інтересненько[^.!?]*[.!?…]?\s*/iu,
    /^\s*ага,?\s*/iu,
  ];
  for (let round = 0; round < 4; round += 1) {
    let next = result;
    for (const pattern of patterns) next = next.replace(pattern, '');
    next = next.trim();
    if (next === result) break;
    result = next;
  }
  return result;
}

function capitalizeUkrainian(text) {
  return String(text || '').replace(/^\s*(\p{L})/u, (letter) => letter.toLocaleUpperCase('uk-UA'));
}

function ensurePeriod(text) {
  const s = String(text || '').trim().replace(/[,:;—–-]+$/, '');
  if (!s) return '';
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

function finishLine(text) {
  const finished = ensurePeriod(capitalizeUkrainian(stripSarcasticLeadIn(text)));
  if (!finished || !hasCyrillic(finished) || looksUnfinishedSentence(finished)) return '';
  return finished;
}

function explodeCopyPieces(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => String(sentence).split(/\s+[—–-]\s+|:\s+|;\s+|,\s+що\s+|,\s+щоб\s+/iu))
    .map((part) => part.trim())
    .filter(Boolean);
}

function copyUnitsFrom(shot = {}) {
  const pool = [shot.sourceText, shot.coreFact, shot.headline, shot.detailText, shot.spokenText]
    .map((value) => stripSarcasticLeadIn(value))
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const part of pool.flatMap(explodeCopyPieces)) {
    const finished = finishLine(part);
    if (!finished || splicesTwoThoughts(finished) || seen.has(finished)) continue;
    seen.add(finished);
    unique.push(finished);
  }
  return unique;
}

function pickBand(units, min, max, exclude = new Set()) {
  const scored = units.filter((unit) => !exclude.has(unit) && !splicesTwoThoughts(unit));
  const inBand = scored.filter((unit) => {
    const words = countWords(unit);
    return words >= min && words <= max;
  });
  if (inBand.length > 0) return inBand[0];

  for (let i = 0; i < scored.length; i += 1) {
    const parts = scored[i].replace(/[.!?…]+$/u, '').split(/\s+/).filter(Boolean);
    if (parts.length >= min) continue;
    for (let j = i + 1; j < scored.length && parts.length < min; j += 1) {
      const extra = scored[j].replace(/[.!?…]+$/u, '').split(/\s+/).filter(Boolean);
      for (const word of extra) {
        if (parts.length >= max) break;
        parts.push(word);
        if (parts.length >= min) break;
      }
    }
    if (parts.length < min || parts.length > max) continue;
    const candidate = finishLine(parts.join(' '));
    if (!candidate || splicesTwoThoughts(candidate)) continue;
    const words = countWords(candidate);
    if (candidate && words >= min && words <= max) return candidate;
  }
  return '';
}

/**
 * Deterministic in-band rewrite when the LLM critic is unavailable or stuck.
 * Does not change visual fields. Prefers whole clauses over mid-sentence cuts.
 */
export function repairShotCopy(shot = {}) {
  const units = copyUnitsFrom(shot);
  const headline = pickBand(units, HEADLINE_WORD_MIN, HEADLINE_WORD_MAX)
    || finishLine(shot.headline);
  const detail = pickBand(units, DETAIL_WORD_MIN, DETAIL_WORD_MAX, new Set([headline].filter(Boolean)))
    || pickBand(units, DETAIL_WORD_MIN, DETAIL_HARD_MAX, new Set([headline].filter(Boolean)));
  const spoken = pickBand(units, HEADLINE_WORD_MIN, 18, new Set())
    || headline
    || finishLine(shot.spokenText);
  return {
    ...shot,
    headline,
    detailText: detail || headline,
    spokenText: spoken,
  };
}

export function formatCopyReviewTable(storyboard = {}) {
  const shots = storyboard.shots || [];
  const lines = ['Final copy for review:'];
  shots.forEach((shot, i) => {
    const n = shot.shot || i + 1;
    const issues = findCopyIssues(shot);
    const h = String(shot.headline || '').trim();
    const d = String(shot.detailText || '').trim();
    const s = String(shot.spokenText || '').trim();
    lines.push(`  Shot ${n}`);
    lines.push(`    headline (${countWords(h)}w): ${h}`);
    lines.push(`    detail   (${countWords(d)}w): ${d}`);
    lines.push(`    spoken   (${countWords(s)}w): ${s}`);
    lines.push(`    issues: ${issues.length ? issues.join('; ') : 'none'}`);
  });
  return lines.join('\n');
}

export function digestStoryboardSlug(digestId) {
  return String(digestId || 'latest').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function writeStoryboardFile(outputDir, digestId, storyboard, { now = () => new Date() } = {}) {
  const timestamp = now().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const slug = digestStoryboardSlug(digestId);
  const filepath = join(outputDir, `storyboard_${slug}_${timestamp}.json`);
  writeFileSync(filepath, JSON.stringify({
    digestId,
    savedAt: now().toISOString(),
    shots: storyboard.shots || [],
  }, null, 2));
  return filepath;
}

export function findLatestStoryboardFile(outputDir, digestId) {
  const slug = digestStoryboardSlug(digestId);
  const prefix = `storyboard_${slug}_`;
  let latest = null;
  let latestMtime = 0;
  try {
    for (const name of readdirSync(outputDir)) {
      if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
      const filepath = join(outputDir, name);
      const mtime = statSync(filepath).mtimeMs;
      if (mtime >= latestMtime) {
        latestMtime = mtime;
        latest = filepath;
      }
    }
  } catch {
    return null;
  }
  return latest;
}

export function readStoryboardFile(filepath) {
  const parsed = JSON.parse(readFileSync(filepath, 'utf8'));
  return {
    digestId: parsed.digestId,
    shots: parsed.shots || [],
  };
}

const CRITIC_SYSTEM = `Ти — редактор українських Reels/Shorts для NiSeNews.
Перевір on-screen copy кожного shot проти coreFact.

Заборонено: однослівні заголовки («Класика.»), саркастичні зачини,
незавершені речення, два речення в detail, тире/крапка з комою, що склеюють дві думки.

Обов'язково:
- headline: РІВНО одне завершене українське речення, 6–11 слів, підмет + присудок + додаток.
- detailText: РІВНО одне завершене українське речення, 8–12 слів, не повторює headline.
- spokenText: одне завершене українське речення (факт, не сарказм).
- Бренди латиницею: Meta, Nvidia, Google, AI, GPT, Llama.
- Текст має читатися з першого погляду і чіпляти конкретним фактом (хто що зробив).

Відповідай JSON:
{"shots":[{"shot":1,"pass":true,"issues":[],"headline":"...","detailText":"...","spokenText":"..."}]}
Якщо pass=true, повтори поточні рядки. Якщо pass=false, перепиши лише headline/detailText/spokenText.`;

function applyCopyFields(shot, patch = {}) {
  const next = { ...shot };
  for (const field of COPY_FIELDS) {
    if (patch[field] != null && String(patch[field]).trim()) {
      next[field] = String(patch[field]).trim();
    }
  }
  return next;
}

function localizeShot(shot) {
  try {
    return assertFinishedReelCopy(ensureUkrainianOnScreenCopy(shot));
  } catch {
    return ensureUkrainianOnScreenCopy(shot);
  }
}

async function defaultCompleteJson(systemPrompt, userPrompt) {
  if (shouldPreferCloudflareLlm()) {
    return completeCloudflareJson(systemPrompt, userPrompt, { maxTokens: 2800 });
  }
  const llmVendor = String(process.env.LLM_VENDOR || '').trim().toLowerCase();
  let text;
  if (llmVendor === 'openrouter' || process.env.OPENROUTER_API_KEY) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY missing in .env');
    }
    const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        ...(process.env.BASE_URL ? { 'HTTP-Referer': process.env.BASE_URL } : {}),
        'X-Title': 'NiSeNews reel copy review',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2800,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error?.message || `OpenRouter copy review failed (${res.status})`);
    }
    text = payload?.choices?.[0]?.message?.content;
  } else if (process.env.OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2800,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error?.message || `OpenAI copy review failed (${res.status})`);
    }
    text = payload?.choices?.[0]?.message?.content;
  } else {
    throw new Error('No API key found for reel copy review');
  }
  if (!text) throw new Error('Copy review response did not contain text content');
  const jsonMatch = String(text).match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse copy review JSON');
  return JSON.parse(jsonMatch[0]);
}

function shotsNeedLlm(shots) {
  return shots.some((shot) => findCopyIssues(shot).length > 0);
}

function buildReviewUserPrompt(shots, round) {
  const payload = shots.map((shot, i) => ({
    shot: shot.shot || i + 1,
    coreFact: shot.coreFact || '',
    headline: shot.headline || '',
    detailText: shot.detailText || '',
    spokenText: shot.spokenText || '',
    heuristicIssues: findCopyIssues(shot),
  }));
  return `Раунд ${round + 1}/${COPY_REVIEW_MAX_ROUNDS}. Перевір і за потреби перепиши copy.\n${JSON.stringify({ shots: payload }, null, 2)}`;
}

/**
 * Review and rewrite overlay copy. Visual fields are left untouched.
 * @param {object} storyboard
 * @param {{ completeJson?: Function, log?: Function, maxRounds?: number }} [options]
 */
export async function reviewReelStoryboard(storyboard = {}, options = {}) {
  const {
    completeJson = defaultCompleteJson,
    log: logFn = () => {},
    maxRounds = COPY_REVIEW_MAX_ROUNDS,
  } = options;

  let shots = (storyboard.shots || []).map((shot) => localizeShot(shot));

  for (let round = 0; round < maxRounds; round += 1) {
    const heuristicFails = shots.filter((shot) => findCopyIssues(shot).length > 0);
    const shouldCallLlm = round === 0 || heuristicFails.length > 0;
    if (!shouldCallLlm && !shotsNeedLlm(shots)) break;

    let llmPayload = null;
    try {
      llmPayload = await completeJson(CRITIC_SYSTEM, buildReviewUserPrompt(shots, round));
    } catch (err) {
      if (heuristicFails.length === 0) {
        logFn(`Copy critic skipped (${err.message}); heuristics passed.`);
        break;
      }
      logFn(`Copy critic unavailable (${err.message}); applying deterministic repair.`);
      shots = shots.map((shot) => localizeShot(repairShotCopy(shot)));
      break;
    }

    const llmShots = Array.isArray(llmPayload?.shots) ? llmPayload.shots : [];
    shots = shots.map((shot, i) => {
      const patch = llmShots.find((row) => Number(row.shot) === Number(shot.shot || i + 1))
        || llmShots[i]
        || {};
      const llmFailed = patch.pass === false || (Array.isArray(patch.issues) && patch.issues.length > 0);
      const heuristicFailed = findCopyIssues(shot).length > 0;
      if (!llmFailed && !heuristicFailed) return localizeShot(shot);
      return localizeShot(applyCopyFields(shot, patch));
    });

    const remaining = shots.filter((shot) => findCopyIssues(shot).length > 0);
    logFn(`Copy review round ${round + 1}: ${shots.length - remaining.length}/${shots.length} shots passed.`);
    if (remaining.length === 0) break;
  }

  const failed = shots
    .map((shot, i) => ({ shot, i, issues: findCopyIssues(shot) }))
    .filter((row) => row.issues.length > 0);
  if (failed.length > 0) {
    logFn(`Copy review still flagged ${failed.length} shot(s); applying deterministic repair.`);
    shots = shots.map((shot) => {
      if (findCopyIssues(shot).length === 0) return shot;
      return localizeShot(repairShotCopy(shot));
    });
  }

  const stillFailed = shots.filter((shot) => findCopyIssues(shot).length > 0);
  if (stillFailed.length > 0) {
    const reviewed = { ...storyboard, shots };
    throw new ReelCopyReviewError(
      `Reel copy review could not finish in-band copy.\n${formatCopyReviewTable(reviewed)}`,
    );
  }

  shots = shots.map((shot) => assertFinishedReelCopy(ensureUkrainianOnScreenCopy(shot)));
  return { ...storyboard, shots };
}
