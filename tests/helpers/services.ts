// Sprint 02 (P0-5) — service lifecycle helpers for the harness.
//
// Backend (Node :3002) binds at import time and exports no handle, so tests
// boot it via `import '../backend/auth-server.js'` (singleFork +
// isolate:false in vitest.config.ts => imported exactly once per run).
// python-service (:8000) is spawned on demand and only killed if we started
// it — a healthy port we didn't open is reused, never touched.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BACKEND_BASE = 'http://127.0.0.1:3002';
export const PYTHON_BASE = 'http://127.0.0.1:8000';

export interface HealthPoll {
  ok: boolean;
  elapsedMs: number;
  body: any;
  lastError: string;
}

export async function pollHealth(url: string, deadlineMs: number): Promise<HealthPoll> {
  const start = Date.now();
  let lastError = 'not attempted';
  while (Date.now() - start < deadlineMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return { ok: true, elapsedMs: Date.now() - start, body: await res.json(), lastError: '' };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err?.cause?.code ? `${err.cause.code}` : `${err?.message ?? err}`;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { ok: false, elapsedMs: Date.now() - start, body: null, lastError };
}

function pythonBin(): string {
  const venv = join(ROOT, '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : 'python3';
}

let pythonProc: ChildProcess | null = null;

/** Ensure python-service answers on :8000 (spawn it iff the port is dark). */
export async function ensurePythonService(bootDeadlineMs = 20_000): Promise<string> {
  const probe = await pollHealth(`${PYTHON_BASE}/health`, 1500);
  if (probe.ok) return PYTHON_BASE; // reuse: never kill what we didn't start
  pythonProc = spawn(pythonBin(), [join(ROOT, 'python-service', 'main.py')], {
    cwd: join(ROOT, 'python-service'),
    stdio: 'ignore',
    env: { ...process.env, DEV: '0' },
  });
  const ready = await pollHealth(`${PYTHON_BASE}/health`, bootDeadlineMs);
  if (!ready.ok) {
    stopPythonService();
    throw new Error(`python-service failed to boot within ${bootDeadlineMs}ms (${ready.lastError})`);
  }
  return PYTHON_BASE;
}

/** Stop the python-service instance this helper started, if any. */
export function stopPythonService(): void {
  if (pythonProc && pythonProc.exitCode === null) {
    pythonProc.kill('SIGTERM');
  }
  pythonProc = null;
}
