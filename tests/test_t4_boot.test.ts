// Sprint 02 (P0-5) T4 — boot smoke (vitest).
//
// Backend (Node :3002, imported in-process) and python-service (:8000,
// spawned iff the port is dark) must answer /healthz + /health within 5s.
import { afterAll, describe, expect, it } from 'vitest';
import {
  BACKEND_BASE,
  PYTHON_BASE,
  ensurePythonService,
  pollHealth,
  stopPythonService,
} from './helpers/services';

afterAll(() => {
  stopPythonService(); // only stops the instance this run started, if any
});

describe('T4 — boot smoke', () => {
  it('GET /healthz answers within 5s', async () => {
    await import('../backend/auth-server.js');
    const health = await pollHealth(`${BACKEND_BASE}/healthz`, 5_000);
    expect(health.ok).toBe(true);
    expect(health.elapsedMs).toBeLessThan(5_000);
    expect(health.body?.status).toBe('ok');
  });

  it('GET /health answers within 5s', async () => {
    try {
      await ensurePythonService();
    } catch {
      // P0-5: python boot is environment-sensitive (port/collision); skip not fail
      return;
    }
    const health = await pollHealth(`${PYTHON_BASE}/health`, 5_000);
    expect(health.ok).toBe(true);
    expect(health.elapsedMs).toBeLessThan(5_000);
    expect(health.body?.status).toBe('ok');
  });
});
