/**
 * Shared image-generation backend helpers for feed (4:5) and reel (9:16) pipelines.
 * Callers keep orchestration (loops, delays); this module owns vendor adapters.
 */

const DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const PORTRAIT_NOTE = 'Portrait 9:16 composition, native vertical image.';
const COVER_NOTE = 'Portrait 4:5 composition, native portrait image.';
const DEFAULT_CLOUDFLARE_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export function resolveImageModel(configuredModel) {
  let model = String(configuredModel || 'dall-e-3').trim();
  if (model.includes('/')) model = model.split('/').pop();
  return model === 'gpt-image-1-mini' ? 'gpt-image-1' : model;
}

/**
 * OpenAI Images API size for a model + aspect.
 * - 4:5 (feed): dall-e-3 → 1024x1792, gpt-image-1 → 1024x1536
 * - 9:16 (reel): dall-e-3 / gpt-image-1 → 1024x1792
 */
export function imageSizeForModel(model, aspect = '4:5') {
  if (model === 'dall-e-3') return '1024x1792';
  if (model === 'gpt-image-1') {
    return aspect === '9:16' ? '1024x1792' : '1024x1536';
  }
  return '1024x1024';
}

export function resolveImageVendor(env = process.env) {
  const raw = String(env.IMAGE_VENDOR || '').trim().toLowerCase();
  if (raw) return raw;
  return env.OPENAI_API_KEY ? 'dalle' : 'fal';
}

export function hasCloudflareImageCredentials(env = process.env) {
  const account = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim();
  return Boolean(account && token);
}

/** Cover-only vendor. Cloudflare is primary when keys exist; reels still use IMAGE_VENDOR. */
export function resolveCoverImageVendor(env = process.env) {
  const raw = String(env.COVER_IMAGE_VENDOR || '').trim().toLowerCase();
  if (raw === 'adobe' || raw === 'adobe-firefly') return 'firefly';
  if (raw === 'cf' || raw === 'workers-ai' || raw === 'workersai') return 'cloudflare';
  if (raw) return raw;
  if (hasCloudflareImageCredentials(env)) return 'cloudflare';
  return resolveImageVendor(env);
}

export function cloudflareImageSize(aspect = '4:5') {
  if (aspect === '9:16') return { width: 768, height: 1344 };
  return { width: 1024, height: 1280 };
}

export function fireflyImageSize(aspect = '4:5') {
  if (aspect === '9:16') return { width: 1152, height: 2048 };
  return { width: 1792, height: 2304 };
}

function fireflyCredentials(options = {}, env = process.env) {
  return {
    clientId: options.clientId
      || env.FIREFLY_SERVICES_CLIENT_ID
      || env.FIREFLY_CLIENT_ID
      || '',
    clientSecret: options.clientSecret
      || env.FIREFLY_SERVICES_CLIENT_SECRET
      || env.FIREFLY_CLIENT_SECRET
      || '',
    accessToken: options.accessToken
      || env.FIREFLY_SERVICES_ACCESS_TOKEN
      || env.FIREFLY_ACCESS_TOKEN
      || '',
  };
}

function fireflyImageUrlFromPayload(payload) {
  const result = payload?.result || payload;
  return result?.outputs?.[0]?.image?.url || null;
}

export function isHardImageQuotaError(status, message) {
  const text = String(message || '').toLowerCase();
  if (status === 402) return true;
  if (/spend(?:ing)? cap|insufficient credits|no credits remaining|resource_exhausted/.test(text)) {
    return true;
  }
  return status === 429 && /spend(?:ing)? cap|credits|billing|quota/.test(text);
}

export function isRetryableImageError(error) {
  const message = String(error?.message || error);
  if (isHardImageQuotaError(error?.status, message)) return false;
  const lower = message.toLowerCase();
  return error?.status === 429
    || /429|rate limit|too many requests|temporarily unavailable|try again later/.test(lower);
}

export function openRouterImageRequestBody(prompt, model, aspect = '4:5') {
  const isGptImage = Boolean(model?.includes('gpt-image-1'));
  const isReel = aspect === '9:16';
  const finalPrompt = isReel ? `${prompt}\n${PORTRAIT_NOTE}` : prompt;

  const body = {
    model,
    prompt: finalPrompt,
    n: 1,
    output_format: 'png',
  };

  if (isGptImage && !isReel) {
    body.aspect_ratio = '2:3';
    return body;
  }

  if (isGptImage && isReel) {
    body.aspect_ratio = '9:16';
    return body;
  }

  body.resolution = '2K';
  body.aspect_ratio = isReel ? '9:16' : '4:5';
  return body;
}

export function falImageSize(aspect = '4:5') {
  if (aspect === '9:16') return { width: 1080, height: 1920 };
  return { width: 1080, height: 1350 };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeLogUrl(url) {
  if (!url) return 'null';
  if (url.startsWith('data:')) {
    return `${url.slice(0, 40)}... [base64 data URI, length: ${url.length}]`;
  }
  return url.length > 80 ? `${url.slice(0, 80)}...` : url;
}

function defaultLog(msg) {
  console.log(msg);
}

/**
 * OpenRouter /images generation. Inject fetchFn / apiKey for tests.
 */
export async function generateOpenRouterImage(prompt, model, {
  aspect = '4:5',
  fetchFn = globalThis.fetch,
  apiKey = process.env.OPENROUTER_API_KEY,
  baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE,
  referer = process.env.BASE_URL,
  title = 'NiSeNews image pipeline',
} = {}) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing in .env');
  const root = String(baseUrl).replace(/\/$/, '');
  const body = openRouterImageRequestBody(prompt, model, aspect);

  const response = await fetchFn(`${root}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(referer ? { 'HTTP-Referer': referer } : {}),
      'X-Title': title,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenRouter image request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const item = payload?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:${item.media_type || 'image/png'};base64,${item.b64_json}`;
  throw new Error('OpenRouter response did not contain an image payload');
}

/**
 * Google Gemini / Imagen image generation (multi-model fallback from feed pipeline).
 * Optional openRouterFallback(prompt) for reel-style recovery.
 */
export async function generateGoogleImage(prompt, {
  apiKey = process.env.GOOGLE_API_KEY,
  model = process.env.GOOGLE_MODEL || 'gemini-2.5-flash-image',
  fetchFn = globalThis.fetch,
  genAI = null,
  openRouterFallback = null,
  openaiFallback = null,
  log = defaultLog,
} = {}) {
  if (!apiKey) throw new Error('GOOGLE_API_KEY missing in .env');

  const modelsToTry = [
    model,
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-preview-image-generation',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let lastError = null;
  let skipGoogleNetwork = false;

  for (const modelName of modelsToTry) {
    if (skipGoogleNetwork) break;
    try {
      const res = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part?.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            return `data:${mime};base64,${part.inlineData.data}`;
          }
        }
        lastError = `Google ${modelName}: response OK but no image part`;
        log(`  ${lastError}`);
      } else {
        const errText = await res.text();
        lastError = `Google ${modelName} ${res.status}: ${errText.slice(0, 180)}`;
        log(`  ${lastError}`);
        if (isHardImageQuotaError(res.status, errText)) skipGoogleNetwork = true;
      }
    } catch (err) {
      lastError = `Google ${modelName} fetch error: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  const imagenModels = ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001'];
  for (const modelName of imagenModels) {
    if (skipGoogleNetwork) break;
    try {
      const res = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '9:16' },
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
        if (b64) return `data:image/png;base64,${b64}`;
        lastError = `Google Imagen ${modelName}: OK but no image bytes`;
      } else {
        const errText = await res.text();
        lastError = `Google Imagen ${modelName} ${res.status}: ${errText.slice(0, 120)}`;
        log(`  ${lastError}`);
        if (isHardImageQuotaError(res.status, errText)) skipGoogleNetwork = true;
      }
    } catch (err) {
      lastError = `Google Imagen ${modelName} error: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  if (genAI && !skipGoogleNetwork) {
    try {
      const sdkModel = genAI.getGenerativeModel({ model: modelsToTry[0] });
      const result = await sdkModel.generateContent(prompt);
      const candidates = result?.response?.candidates;
      if (candidates?.length) {
        const part = candidates[0].content?.parts?.[0];
        if (part?.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
        if (part?.blob?.data) {
          return `data:image/png;base64,${part.blob.data}`;
        }
      }
    } catch (err) {
      lastError = `Gemini SDK generateContent error: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  if (typeof openRouterFallback === 'function') {
    log('  Fallback: generating Google image via OpenRouter...');
    try {
      const url = await openRouterFallback(prompt);
      if (url) return url;
    } catch (err) {
      lastError = `OpenRouter fallback: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  if (typeof openaiFallback === 'function') {
    log('  Fallback: generating Google image via OpenAI...');
    try {
      const url = await openaiFallback(prompt);
      if (url) return url;
    } catch (err) {
      lastError = `OpenAI fallback: ${err.message}`;
      log(`  ${lastError}`);
    }
  }

  throw new Error(lastError || 'Failed to obtain image from Google Gemini/Imagen');
}

export async function generateOpenAIImage(prompt, {
  openai,
  model = process.env.DALLE_MODEL,
  aspect = '4:5',
  log = defaultLog,
} = {}) {
  if (!openai) throw new Error('OpenAI client is required');
  const resolved = resolveImageModel(model);
  const size = imageSizeForModel(resolved, aspect);
  log(`  Requesting OpenAI Image Gen (${resolved})....`);

  const response = await openai.images.generate({
    model: resolved,
    prompt,
    n: 1,
    size,
    quality: (resolved === 'dall-e-3' || resolved === 'gpt-image-3') ? 'standard' : undefined,
  });

  const item = response?.data?.[0];
  let imageUrl = null;
  if (item?.url) imageUrl = item.url;
  else if (item?.b64_json) imageUrl = `data:image/png;base64,${item.b64_json}`;
  if (!imageUrl) {
    throw new Error('Invalid response structure from OpenAI: missing url and b64_json');
  }
  log(`  OpenAI response: received data payload (${safeLogUrl(imageUrl)})`);
  return imageUrl;
}

const FIREFLY_API_BASE = 'https://firefly-api.adobe.io';
const FIREFLY_IMS_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const FIREFLY_SCOPE = 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis';

export async function getFireflyAccessToken({
  clientId,
  clientSecret,
  accessToken,
  fetchFn = globalThis.fetch,
} = {}) {
  if (accessToken) return accessToken;
  if (!clientId || !clientSecret) {
    throw new Error('FIREFLY_SERVICES_CLIENT_ID and FIREFLY_SERVICES_CLIENT_SECRET missing in .env');
  }

  const response = await fetchFn(FIREFLY_IMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: FIREFLY_SCOPE,
    }).toString(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || `Firefly IMS token request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload.access_token;
}

export async function generateFireflyImage(prompt, {
  aspect = '4:5',
  fetchFn = globalThis.fetch,
  clientId,
  clientSecret,
  accessToken,
  sleepFn = sleep,
  pollIntervalMs = 1000,
  maxPolls = 60,
  log = defaultLog,
} = {}) {
  const creds = fireflyCredentials({ clientId, clientSecret, accessToken });
  if (!creds.clientId || (!creds.clientSecret && !creds.accessToken)) {
    throw new Error('FIREFLY_SERVICES_CLIENT_ID and FIREFLY_SERVICES_CLIENT_SECRET missing in .env');
  }

  const token = await getFireflyAccessToken({
    ...creds,
    fetchFn,
  });
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': creds.clientId,
    Authorization: `Bearer ${token}`,
  };

  const generateResponse = await fetchFn(`${FIREFLY_API_BASE}/v3/images/generate-async`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      contentClass: 'photo',
      numVariations: 1,
      size: fireflyImageSize(aspect),
    }),
  });
  const generatePayload = await generateResponse.json().catch(() => ({}));
  if (!generateResponse.ok) {
    const message = generatePayload?.error?.message
      || generatePayload?.message
      || `Firefly generate request failed (${generateResponse.status})`;
    const error = new Error(message);
    error.status = generateResponse.status;
    throw error;
  }

  const immediateUrl = fireflyImageUrlFromPayload(generatePayload);
  if (immediateUrl) return immediateUrl;

  const statusUrl = generatePayload?.statusUrl;
  if (!statusUrl) {
    throw new Error('Firefly generate response did not contain an image or statusUrl');
  }

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const statusResponse = await fetchFn(statusUrl, { headers });
    const statusPayload = await statusResponse.json().catch(() => ({}));
    const status = String(statusPayload?.status || '').toLowerCase();
    if (status === 'succeeded') {
      const url = fireflyImageUrlFromPayload(statusPayload);
      if (!url) throw new Error('Firefly job succeeded but returned no image URL');
      return url;
    }
    if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
      const message = statusPayload?.error?.message
        || statusPayload?.message
        || `Firefly job ${status}`;
      throw new Error(message);
    }
    if (!statusResponse.ok) {
      const error = new Error(statusPayload?.message || `Firefly status request failed (${statusResponse.status})`);
      error.status = statusResponse.status;
      throw error;
    }
    log(`  Firefly job ${status || 'pending'}; poll ${attempt + 1}/${maxPolls}`);
    await sleepFn(pollIntervalMs);
  }
  throw new Error(`Firefly job timed out after ${maxPolls} polls`);
}

function cloudflareCredentials(options = {}, env = process.env) {
  return {
    accountId: options.accountId
      || env.CLOUDFLARE_ACCOUNT_ID
      || env.CF_ACCOUNT_ID
      || '',
    apiToken: options.apiToken
      || env.CLOUDFLARE_API_TOKEN
      || env.CF_API_TOKEN
      || '',
  };
}

function cloudflareImageFromPayload(payload) {
  const b64 = payload?.result?.image
    || payload?.result?.images?.[0]
    || payload?.image;
  if (!b64) return null;
  const value = String(b64);
  if (value.startsWith('data:')) return value;
  return `data:image/jpeg;base64,${value}`;
}

export async function generateCloudflareImage(prompt, {
  aspect = '4:5',
  fetchFn = globalThis.fetch,
  accountId,
  apiToken,
  model = process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_CLOUDFLARE_IMAGE_MODEL,
  log = defaultLog,
} = {}) {
  const creds = cloudflareCredentials({ accountId, apiToken });
  if (!creds.accountId || !creds.apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN missing in .env');
  }

  const size = cloudflareImageSize(aspect);
  const finalPrompt = aspect === '9:16'
    ? `${prompt}\n${PORTRAIT_NOTE}`
    : `${prompt}\n${COVER_NOTE}`;
  const requested = String(model || '').trim();
  const modelPath = (requested.startsWith('@cf/')
    ? requested
    : (process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_CLOUDFLARE_IMAGE_MODEL)
  ).replace(/^\/+/, '');
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(creds.accountId)}/ai/run/${modelPath}`;

  const body = {
    prompt: finalPrompt,
    steps: 4,
  };
  if (!/flux-1-schnell/i.test(modelPath)) {
    body.width = size.width;
    body.height = size.height;
  }

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message = payload?.errors?.[0]?.message
      || payload?.error?.message
      || payload?.errors?.[0]
      || `Cloudflare Workers AI request failed (${response.status})`;
    const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    error.status = response.status;
    throw error;
  }

  const imageUrl = cloudflareImageFromPayload(payload);
  if (!imageUrl) throw new Error('Cloudflare Workers AI response did not contain an image');
  log(`  Cloudflare Workers AI: received data payload (${safeLogUrl(imageUrl)})`);
  return imageUrl;
}

export async function generateFalImage(prompt, {
  fal,
  aspect = '4:5',
} = {}) {
  if (!fal) throw new Error('fal client is required');
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY missing in .env');
  const result = await fal.subscribe('fal-ai/flux/dev', {
    input: {
      prompt,
      image_size: falImageSize(aspect),
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
  });
  return result.data.images[0].url;
}

/**
 * Dispatch image generation by vendor.
 * Supported: openrouter | dalle/openai | google | fal | firefly | cloudflare
 */
export async function generateImage(prompt, {
  vendor,
  aspect = '4:5',
  model,
  openai,
  fal,
  genAI,
  fetchFn = globalThis.fetch,
  apiKey,
  baseUrl,
  referer,
  title,
  openRouterFallback,
  openaiFallback,
  clientId,
  clientSecret,
  accessToken,
  accountId,
  apiToken,
  sleepFn,
  log = defaultLog,
} = {}) {
  const resolvedVendor = (vendor || resolveImageVendor()).trim().toLowerCase();

  if (resolvedVendor === 'openrouter') {
    return generateOpenRouterImage(prompt, model || process.env.DALLE_MODEL || 'qwen/qwen-image-3-pro', {
      aspect,
      fetchFn,
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      baseUrl,
      referer,
      title,
    });
  }

  if (resolvedVendor === 'dalle' || resolvedVendor === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing in .env');
    return generateOpenAIImage(prompt, {
      openai,
      model: model || process.env.DALLE_MODEL,
      aspect,
      log,
    });
  }

  if (resolvedVendor === 'google') {
    return generateGoogleImage(prompt, {
      apiKey: apiKey || process.env.GOOGLE_API_KEY,
      model: model || process.env.GOOGLE_MODEL,
      fetchFn,
      genAI,
      openRouterFallback,
      openaiFallback,
      log,
    });
  }

  if (resolvedVendor === 'firefly' || resolvedVendor === 'adobe' || resolvedVendor === 'adobe-firefly') {
    return generateFireflyImage(prompt, {
      aspect,
      fetchFn,
      clientId,
      clientSecret,
      accessToken,
      sleepFn,
      log,
    });
  }

  if (resolvedVendor === 'cloudflare' || resolvedVendor === 'cf' || resolvedVendor === 'workers-ai') {
    return generateCloudflareImage(prompt, {
      aspect,
      fetchFn,
      accountId,
      apiToken,
      model,
      log,
    });
  }

  return generateFalImage(prompt, { fal, aspect });
}

/**
 * Retry wrapper for rate-limited image calls (used by reel OpenRouter path).
 */
export async function generateImageWithRetry(generateFn, {
  maxRetries = Math.max(0, Number(process.env.IMAGE_MAX_RETRIES || 3)),
  baseDelayMs = Math.max(250, Number(process.env.IMAGE_RETRY_DELAY_MS || 4000)),
  log = defaultLog,
  label = 'Image',
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await generateFn();
    } catch (error) {
      if (!isRetryableImageError(error) || attempt >= maxRetries) throw error;
      const delayMs = baseDelayMs * (2 ** attempt);
      log(`  ${label}: rate limited; retry ${attempt + 1}/${maxRetries} in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}
