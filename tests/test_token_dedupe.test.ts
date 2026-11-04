// Sprint 06 gap closed in Sprint 08 — upstream-call counting (P1-8).
//
// With the Meta static Bearer there is no token lifecycle to dedupe, so this
// test proves the replacement invariant: N concurrent chat requests produce
// exactly N upstream Meta calls (1:1, no amplification, no thundering herd).
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captured, metaTextHandler, resetCapture } from './helpers/meta-mock';
import { BACKEND_BASE, pollHealth } from './helpers/services';

const server = setupServer(metaTextHandler('counted reply'));

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await import('../backend/auth-server.js');
  const health = await pollHealth(`${BACKEND_BASE}/healthz`, 15_000);
  if (!health.ok) throw new Error(`backend failed to boot (${health.lastError})`);
}, 30_000);

afterAll(() => {
  server.close();
});

describe('P1-8 — no upstream amplification (static Bearer, counting mock)', () => {
  it('3 concurrent chats produce exactly 3 upstream Meta calls', async () => {
    resetCapture();
    const bodies = Array.from({ length: 3 }, (_, i) => ({
      model: 'muse-spark-1.3-contributor',
      message: `concurrent ${i}`,
      history: [],
      config: {},
    }));
    const results = await Promise.all(
      bodies.map((body) =>
        fetch(`${BACKEND_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(async (r) => ({ status: r.status, json: await r.json() })),
      ),
    );
    for (const r of results) {
      expect(r.status).toBe(200);
      expect(typeof r.json.text).toBe('string');
    }
    expect(captured.calls).toBe(3);
  });
});
