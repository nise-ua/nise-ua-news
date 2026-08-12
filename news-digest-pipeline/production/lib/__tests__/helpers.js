/**
 * Shared test helpers for production library extraction.
 * Keep these free of real network / ffmpeg / sqlite calls.
 */

import { vi } from 'vitest';

/**
 * Temporarily set process.env keys, then restore previous values.
 * Usage:
 *   withEnv({ API_KEY: 'x' }, () => { ... });
 *   const restore = withEnv({ API_KEY: 'x' }); restore();
 */
export function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = Object.prototype.hasOwnProperty.call(process.env, key)
      ? process.env[key]
      : undefined;
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }

  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  if (typeof fn === 'function') {
    try {
      return fn();
    } finally {
      restore();
    }
  }
  return restore;
}

/**
 * Stub global fetch with a sequence or matcher list.
 *
 * @param {Array<{ urlIncludes?: string, status?: number, body?: string, json?: object, headers?: Record<string,string> }> | Function} handlers
 */
export function mockFetchResponses(handlers) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const href = String(url);
    const handler = typeof handlers === 'function'
      ? handlers(href, options)
      : (Array.isArray(handlers)
        ? handlers.find(h => !h.urlIncludes || href.includes(h.urlIncludes)) || handlers[handlers.length - 1]
        : handlers);

    if (!handler) {
      return {
        ok: false,
        status: 404,
        headers: new Map(),
        text: async () => '',
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }

    const status = handler.status ?? 200;
    const body = handler.body ?? '';
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name) => (handler.headers || {})[String(name).toLowerCase()] || null,
      },
      text: async () => body,
      json: async () => handler.json ?? (body ? JSON.parse(body) : {}),
      arrayBuffer: async () => Uint8Array.from(Buffer.from(body)).buffer,
    };
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Build an execFileSync mock that answers sqlite3 queries by SQL substring.
 *
 * @param {Record<string, string>} rowsBySqlSnippet
 */
export function sqliteExecMock(rowsBySqlSnippet = {}) {
  return vi.fn((cmd, args = []) => {
    if (cmd !== 'sqlite3') {
      throw new Error(`sqliteExecMock unexpected command: ${cmd}`);
    }
    const sql = String(args[args.length - 1] || '');
    for (const [snippet, result] of Object.entries(rowsBySqlSnippet)) {
      if (sql.includes(snippet)) return result;
    }
    return '';
  });
}

/**
 * Generic execFileSync spy. Calls `impl(cmd, args, options)` when provided,
 * otherwise records calls and returns `defaultReturn`.
 */
export function mockExecFileSync({ impl, defaultReturn = '' } = {}) {
  return vi.fn((cmd, args = [], options = {}) => {
    if (typeof impl === 'function') return impl(cmd, args, options);
    return defaultReturn;
  });
}

export function unstubGlobals() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}
