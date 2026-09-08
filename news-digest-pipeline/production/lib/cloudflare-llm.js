import { hasCloudflareImageCredentials } from './image-backends.js';

export const DEFAULT_CLOUDFLARE_LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export function cloudflareLlmModel() {
  return String(process.env.CLOUDFLARE_LLM_MODEL || DEFAULT_CLOUDFLARE_LLM_MODEL).trim()
    || DEFAULT_CLOUDFLARE_LLM_MODEL;
}

export function extractJsonObject(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('Cloudflare LLM returned empty text');
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Cloudflare LLM did not return JSON');
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error('Cloudflare LLM JSON is invalid');
  }
}

export function extractLlmText(payload) {
  const choice = payload?.choices?.[0]?.message?.content
    || payload?.result?.choices?.[0]?.message?.content;
  if (typeof choice === 'string' && choice.trim()) return choice;
  const result = payload?.result;
  if (typeof result === 'string' && result.trim()) return result;
  if (typeof result?.response === 'string') return result.response;
  if (Array.isArray(result?.response)) {
    return result.response
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  return '';
}

export function shouldPreferCloudflareLlm(env = process.env) {
  if (String(env.CLOUDFLARE_LLM || '1').trim() === '0') return false;
  return hasCloudflareImageCredentials(env);
}

function cloudflareError(payload, status) {
  return payload?.errors?.[0]?.message
    || payload?.error?.message
    || `Cloudflare LLM failed (${status})`;
}

async function postCloudflare(fetchFn, url, token, body) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  return { res, payload };
}

export async function completeCloudflareJson(systemPrompt, userPrompt, {
  fetchFn = fetch,
  maxTokens = 2048,
} = {}) {
  if (!hasCloudflareImageCredentials()) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for Cloudflare LLM');
  }

  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID).trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN).trim();
  const model = cloudflareLlmModel();
  const system = `${systemPrompt}\n\nReply with valid JSON only. No markdown.`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt },
  ];
  const chatUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
  const runUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  let { res, payload } = await postCloudflare(fetchFn, chatUrl, token, {
    model,
    messages,
    max_tokens: maxTokens,
  });
  if (!res.ok || payload?.success === false) {
    const fallback = await postCloudflare(fetchFn, runUrl, token, {
      messages,
      max_tokens: maxTokens,
    });
    if (!fallback.res.ok || fallback.payload?.success === false) {
      throw new Error(cloudflareError(payload, res.status));
    }
    res = fallback.res;
    payload = fallback.payload;
  }

  const text = extractLlmText(payload);
  return extractJsonObject(text);
}

export async function completeCloudflareJsonText(systemPrompt, userPrompt, options = {}) {
  return JSON.stringify(await completeCloudflareJson(systemPrompt, userPrompt, options));
}
