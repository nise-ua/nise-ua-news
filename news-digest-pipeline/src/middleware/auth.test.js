import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardAuth, resetLoginAttemptsForTests } from './auth.js';

function mockReq(headers = {}, ip = '127.0.0.1') {
  return {
    headers,
    ip,
    socket: { remoteAddress: ip },
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

describe('dashboardAuth login rate limit', () => {
  afterEach(() => {
    resetLoginAttemptsForTests();
    vi.unstubAllEnvs();
  });

  it('does not count unauthenticated page loads toward the limit', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
    vi.stubEnv('DASHBOARD_USER', 'admin');

    for (let i = 0; i < 20; i += 1) {
      const req = mockReq();
      const res = mockRes();
      let nextCalled = false;
      dashboardAuth(req, res, () => { nextCalled = true; });
      expect(res.statusCode).toBe(401);
      expect(res.body).toBe('Authentication required');
      expect(nextCalled).toBe(false);
    }
  });

  it('blocks after ten wrong passwords from the same IP', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
    vi.stubEnv('DASHBOARD_USER', 'admin');

    const badAuth = { authorization: `Basic ${Buffer.from('admin:wrong').toString('base64')}` };

    for (let i = 0; i < 10; i += 1) {
      const res = mockRes();
      dashboardAuth(mockReq(badAuth), res, () => {});
      expect(res.statusCode).toBe(401);
    }

    const blocked = mockRes();
    dashboardAuth(mockReq(badAuth), blocked, () => {});
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toBe('Too many login attempts, try again later');
  });

  it('clears failed attempts after a successful login', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_PASSWORD', 'secret');
    vi.stubEnv('DASHBOARD_USER', 'admin');

    const badAuth = { authorization: `Basic ${Buffer.from('admin:wrong').toString('base64')}` };
    const goodAuth = { authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}` };

    for (let i = 0; i < 9; i += 1) {
      dashboardAuth(mockReq(badAuth), mockRes(), () => {});
    }

    let ok = false;
    dashboardAuth(mockReq(goodAuth), mockRes(), () => { ok = true; });
    expect(ok).toBe(true);

    let stillOk = false;
    dashboardAuth(mockReq(goodAuth), mockRes(), () => { stillOk = true; });
    expect(stillOk).toBe(true);
  });
});
