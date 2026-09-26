/**
 * Shared LLM routing for media JSON/text tasks.
 * Uses LLM_MODEL (OPENAI_MODEL / CLAUDE_MODEL aliases). Cloudflare text is
 * opt-in via CLOUDFLARE_LLM=1, independent of image credentials default.
 */

import { completeCloudflareJson, extractJsonObject, shouldPreferCloudflareLlm } from './cloudflare-llm.js';

export const DEFAULT_LLM_MODEL = 'gpt-5.4-mini';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';

export function resolveProductionLlmModel(env = process.env) {
  const fromNew = String(env.LLM_MODEL || '').trim();
  if (fromNew) return fromNew;
  const fromOpenAiAlias = String(env.OPENAI_MODEL || '').trim();
  if (fromOpenAiAlias) return fromOpenAiAlias;
  const fromLegacy = String(env.CLAUDE_MODEL || '').trim();
  if (fromLegacy) return fromLegacy;
  return DEFAULT_LLM_MODEL;
}

function anthropicModel(env = process.env) {
  const requested = resolveProductionLlmModel(env);
  if (/^claude/i.test(requested)) return requested;
  return String(env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL).trim() || DEFAULT_ANTHROPIC_MODEL;
}

function vendor(env = process.env) {
  return String(env.LLM_VENDOR || '').trim().toLowerCase();
}

/** Chat model for cover/reel JSON. Cursor Composer ids are not OpenAI model names. */
export function resolveMediaChatModel(env = process.env) {
  const requested = resolveProductionLlmModel(env);
  const llmVendor = vendor(env);
  if (llmVendor === 'cursor' || /^composer(?:-|$)/i.test(requested)) {
    const alias = String(env.OPENAI_MODEL || '').trim();
    if (alias && !/^composer/i.test(alias)) return alias;
    return DEFAULT_LLM_MODEL;
  }
  return requested;
}

async function postChat({ url, headers, body }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error?.message || `LLM request failed (${res.status})`);
  }
  const text = payload?.choices?.[0]?.message?.content
    || payload?.content?.[0]?.text
    || '';
  if (!text) throw new Error('LLM response did not contain text content');
  return text;
}

function openrouterHeaders(title, env = process.env) {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    ...(env.BASE_URL ? { 'HTTP-Referer': env.BASE_URL } : {}),
    'X-Title': title,
  };
}

async function completeViaVendors(systemPrompt, userPrompt, {
  json = false,
  maxTokens = 2048,
  title = 'NiSeNews',
} = {}) {
  const env = process.env;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const combined = `${systemPrompt}\n\n${userPrompt}`;
  const model = resolveMediaChatModel(env);
  const llmVendor = vendor(env);
  const jsonFormat = json ? { response_format: { type: 'json_object' } } : {};

  if (shouldPreferCloudflareLlm(env) && json) {
    return JSON.stringify(await completeCloudflareJson(systemPrompt, userPrompt, { maxTokens }));
  }

  if (llmVendor === 'openrouter' || (!llmVendor && env.OPENROUTER_API_KEY && !env.OPENAI_API_KEY)) {
    if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY missing in .env');
    const baseUrl = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    return postChat({
      url: `${baseUrl}/chat/completions`,
      headers: openrouterHeaders(title, env),
      body: { model, messages, max_tokens: maxTokens, ...jsonFormat },
    });
  }

  if (llmVendor === 'moonshot') {
    if (!env.MOONSHOT_API_KEY) throw new Error('MOONSHOT_API_KEY missing in .env');
    const baseUrl = (env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
    return postChat({
      url: `${baseUrl}/chat/completions`,
      headers: { Authorization: `Bearer ${env.MOONSHOT_API_KEY}` },
      body: { model, messages, max_tokens: maxTokens, ...jsonFormat },
    });
  }

  if (llmVendor === 'anthropic' || (!env.OPENAI_API_KEY && env.ANTHROPIC_API_KEY)) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing in .env');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: anthropicModel(env),
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: combined }],
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error?.message || `Anthropic request failed (${res.status})`);
    }
    const text = payload?.content?.[0]?.text;
    if (!text) throw new Error('Anthropic response did not contain text content');
    return text;
  }

  if (env.OPENAI_API_KEY) {
    const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    return postChat({
      url: `${baseUrl}/chat/completions`,
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: { model, messages, max_tokens: maxTokens, ...jsonFormat },
    });
  }

  throw new Error('No API key found (OPENAI_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY)');
}

export async function completeJson(systemPrompt, userPrompt, options = {}) {
  const text = await completeViaVendors(systemPrompt, userPrompt, { ...options, json: true });
  return extractJsonObject(text);
}

export async function completeJsonText(systemPrompt, userPrompt, options = {}) {
  return JSON.stringify(await completeJson(systemPrompt, userPrompt, options));
}

export async function completeText(systemPrompt, userPrompt, options = {}) {
  return completeViaVendors(systemPrompt, userPrompt, { ...options, json: false });
}
