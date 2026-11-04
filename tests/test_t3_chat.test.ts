// Sprint 02 (P0-5) T3 — chat passthrough (vitest), Meta path (Sprint 08).
//
// POST /api/chat with history + message (Meta mocked at the fetch
// boundary): asserts history->messages mapping (roles/order preserved, current
// message appended as final user turn) and the {text} return contract.
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captured,
  metaTextHandler,
} from './helpers/meta-mock';
import { BACKEND_BASE, pollHealth } from './helpers/services';

const MODEL_REPLY = 'Hello from the mocked model';

const server = setupServer(metaTextHandler(MODEL_REPLY));

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await import('../backend/auth-server.js');
  const health = await pollHealth(`${BACKEND_BASE}/healthz`, 15_000);
  if (!health.ok) throw new Error(`backend failed to boot (${health.lastError})`);
}, 30_000);

afterAll(() => {
  server.close();
});

describe('T3 — Node /api/chat', () => {
  it('maps history->contents and returns {text}', async () => {
    const history = [
      { role: 'user', content: 'Hi, I need a deck' },
      { role: 'model', content: 'Hello! What is it about?' },
    ];
    const message = 'It is about quarterly testing';

    const res = await fetch(`${BACKEND_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'muse-spark-1.3-contributor', message, history, config: {} }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['text']);
    expect(body.text).toBe(MODEL_REPLY);

    expect(captured.metaBody.messages).toEqual([
      { role: 'user', content: 'Hi, I need a deck' },
      { role: 'assistant', content: 'Hello! What is it about?' },
      { role: 'user', content: message },
    ]);
  });

  it('forwards explicit temperature:0 as 0 (P1-4 Meta path, ?? not ||)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'muse-spark-1.3-contributor',
        message: 'deterministic please',
        history: [],
        config: { temperature: 0 },
      }),
    });

    expect(res.status).toBe(200);
    expect(captured.metaBody.temperature).toBe(0);
  });
});
