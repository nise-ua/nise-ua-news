const CURSOR_API_BASE = 'https://api.cursor.com';
export const CURSOR_POLL_INTERVAL_MS = 4000;
export const CURSOR_POLL_TIMEOUT_MS = 12 * 60 * 1000;

const TERMINAL_RUN = new Set(['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isCursorLlmVendor(vendor) {
  return String(vendor || '').trim().toLowerCase() === 'cursor';
}

export const DEFAULT_CURSOR_MODEL = 'composer-2.5';

const CURSOR_MODEL_ALIASES = {
  composer: DEFAULT_CURSOR_MODEL,
  'composer-2': DEFAULT_CURSOR_MODEL,
  'composer-2-fast': DEFAULT_CURSOR_MODEL,
  'composer-latest': DEFAULT_CURSOR_MODEL,
};

export function isComposerModel(modelId) {
  const id = String(modelId || '').trim().toLowerCase();
  return id === 'composer-2' || id === 'composer-2.5' || id.startsWith('composer-2');
}

export function normalizeCursorModelId(modelId) {
  const id = String(modelId || '').trim();
  if (!id) return DEFAULT_CURSOR_MODEL;
  return CURSOR_MODEL_ALIASES[id.toLowerCase()] || id;
}

/** Prefer Cursor-owned models so digest runs stay on included Composer/Grok usage. */
export function pickCursorModelId(requestedId, availableIds = []) {
  const wanted = normalizeCursorModelId(requestedId);
  const ids = (availableIds || []).map((id) => String(id).trim()).filter(Boolean);
  if (!ids.length) return wanted;
  if (ids.includes(wanted)) return wanted;
  const composer = ids.find((id) => isComposerModel(id));
  if (composer) return composer;
  const grok = ids.find((id) => /^grok/i.test(id));
  if (grok) return grok;
  return ids[0];
}

export function buildCursorModelSelection(modelId, availableIds) {
  return { id: pickCursorModelId(modelId, availableIds) };
}

export function parseCursorDigestPayload(raw, articleIds) {
  const ids = (articleIds || []).map((id) => String(id));
  const text = String(raw || '').trim();
  if (!text) throw new Error('Cursor agent returned empty result');

  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (err) {
    throw new Error(`Cursor agent result is not JSON: ${err.message}`);
  }

  const digest = typeof parsed.digest === 'string' ? parsed.digest.trim() : '';
  if (!digest) throw new Error('Cursor agent JSON is missing digest');

  const rows = Array.isArray(parsed.commentaries) ? parsed.commentaries : [];
  const commentariesById = new Map();
  for (const row of rows) {
    const id = String(row?.id ?? row?.articleId ?? '').trim();
    const commentary = typeof row?.commentary === 'string' ? row.commentary.trim() : '';
    if (id && commentary) commentariesById.set(id, commentary);
  }

  const missing = ids.filter((id) => !commentariesById.has(id));
  if (missing.length) {
    throw new Error(`Cursor agent JSON missing commentaries for article(s): ${missing.join(', ')}`);
  }

  return { digest, commentariesById };
}

/** Cursor-specific overlay: Composer tends to compress to one paragraph unless told otherwise. */
export const CURSOR_TWO_PARAGRAPH_RULES = [
  'CURSOR FORMAT OVERRIDE (every commentary + assembled digest):',
  'Each commentary MUST be exactly 2 short Ukrainian paragraphs — never 1, never 3+.',
  'Separate the two paragraphs with a blank line (use \\n\\n inside JSON strings).',
  'Total length: 60–100 words across both paragraphs.',
  'Paragraph 1: hook and main fact. Paragraph 2: twist, consequence, or dry punchline.',
  'In digest: copy each commentary verbatim. Keep both paragraphs and the blank line between them.',
  'FORBIDDEN: one dense paragraph; merging paragraphs; dropping the second paragraph;',
  'rewriting, shortening, or paraphrasing commentaries during assembly.',
].join('\n');

export function buildCursorDigestPrompt(articles, {
  commentarySystem,
  assemblyPrompt,
  hashtag,
  boundaryIntent,
} = {}) {
  const blocks = (articles || []).map((article) => {
    const content = String(article.content || '').slice(0, 3000);
    const existing = article.commentary
      ? `\nExisting commentary (keep or lightly edit):\n${article.commentary}`
      : '\nExisting commentary: (none — write a new commentary)';
    return [
      `--- ARTICLE id=${article.id} ---`,
      article.title ? `Title: ${article.title}` : null,
      article.url ? `URL: ${article.url}` : null,
      content ? `Body:\n${content}` : null,
      existing,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return [
    'You generate a Ukrainian Facebook news digest. Do not use tools, files, or git.',
    'Reply with a single JSON object and nothing else (no markdown fences, no preamble).',
    '',
    'Schema:',
    '{"commentaries":[{"id":"<article id string>","commentary":"Paragraph one.\\n\\nParagraph two."}],"digest":"<assembled post>"}',
    'Include every article id exactly once. Commentary ids must match the ARTICLE id values.',
    '',
    CURSOR_TWO_PARAGRAPH_RULES,
    '',
    'Commentary rules (Phase A):',
    commentarySystem || '',
    '',
    'Assembly rules (Phase B):',
    assemblyPrompt || '',
    '',
    'Assembly reminder: each numbered item in digest must show both commentary paragraphs with a blank line between them.',
    hashtag ? `Opening hashtag (first line with "1."): ${hashtag}` : '',
    'First line: hashtag, space, then "1." and the first commentary paragraph (second paragraph follows after a blank line).',
    boundaryIntent ? `Footer / disclaimer (verbatim at the end): ${boundaryIntent}` : '',
    'Do not add trailing hashtags or copy these instructions into digest.',
    '',
    'Articles:',
    blocks,
  ].filter((line) => line !== undefined).join('\n');
}

/**
 * Create a no-repo Cloud Agent and wait for the first run to finish.
 * @param {{ apiKey: string, modelId?: string, prompt: string, name?: string, fetchImpl?: typeof fetch, sleepImpl?: Function, now?: Function, pollIntervalMs?: number, pollTimeoutMs?: number }} opts
 */
export async function runCursorCloudAgent(opts) {
  const apiKey = String(opts?.apiKey || '').trim();
  if (!apiKey) throw new Error('Cursor API key не налаштовано (.env: CURSOR_API_KEY)');

  const fetchImpl = opts.fetchImpl || fetch;
  const sleepImpl = opts.sleepImpl || sleep;
  const now = opts.now || (() => Date.now());
  const pollIntervalMs = opts.pollIntervalMs ?? CURSOR_POLL_INTERVAL_MS;
  const pollTimeoutMs = opts.pollTimeoutMs ?? CURSOR_POLL_TIMEOUT_MS;
  const availableIds = await listCursorModelIds(fetchImpl, apiKey);
  const model = buildCursorModelSelection(opts.modelId, availableIds);

  const created = await cursorRequest(fetchImpl, apiKey, 'POST', '/v1/agents', {
    prompt: { text: opts.prompt },
    model,
    name: opts.name || 'News digest',
  });

  const agentId = created?.agent?.id || created?.id;
  const runId = created?.run?.id || created?.agent?.latestRunId;
  if (!agentId || !runId) {
    throw new Error('Cursor create-agent response missing agent.id or run.id');
  }

  const deadline = now() + pollTimeoutMs;
  while (now() < deadline) {
    const run = await cursorRequest(fetchImpl, apiKey, 'GET', `/v1/agents/${agentId}/runs/${runId}`);
    const status = String(run?.status || '').toUpperCase();
    if (TERMINAL_RUN.has(status)) {
      if (status !== 'FINISHED') {
        throw new Error(`Cursor agent run ${runId} ended with status ${status}`);
      }
      const result = typeof run.result === 'string' ? run.result : '';
      if (!result.trim()) throw new Error(`Cursor agent run ${runId} finished with empty result`);
      return { agentId, runId, result, durationMs: run.durationMs || null };
    }
    await sleepImpl(pollIntervalMs);
  }
  throw new Error(`Cursor agent run ${runId} timed out after ${pollTimeoutMs}ms`);
}

async function listCursorModelIds(fetchImpl, apiKey) {
  try {
    const payload = await cursorRequest(fetchImpl, apiKey, 'GET', '/v1/models');
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.map((item) => item?.id).filter(Boolean);
  } catch {
    return [];
  }
}

async function cursorRequest(fetchImpl, apiKey, method, path, body) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`,
    'Content-Type': 'application/json',
  };
  const res = await fetchImpl(`${CURSOR_API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || payload?.message || `HTTP ${res.status}`;
    throw new Error(`Cursor API ${method} ${path} failed: ${msg}`);
  }
  return payload;
}

function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('no JSON object found');
  }
  return candidate.slice(start, end + 1);
}
