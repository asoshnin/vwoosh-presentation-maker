// Sprint 02 (P0-5) T2 — outline + python error contracts (vitest), Meta path (Sprint 08).
//
// T2a (Node POST /api/generate-outline, Meta mocked at the fetch boundary):
//   - happy: Meta returns a JSON string -> 200 {title, slides:[{title,content}]}
//   - malformed: Meta returns prose -> 422 {error: Invalid outline ...}. P1-7 fix.
// T2b (python-service POST /api/process-pptx, hit directly): missing-file
//   error path returns 422 (P0-4 fix) and must never regress to 200.
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captured,
  metaTextHandler,
  resetCapture,
} from './helpers/meta-mock';
import { BACKEND_BASE, PYTHON_BASE, ensurePythonService, pollHealth } from './helpers/services';

const HAPPY_OUTLINE = {
  title: ' contracted outline ',
  slides: [
    { title: 'Slide 1: Intro', content: 'Hook\nProblem\nSolution' },
    { title: 'Slide 2: Outro', content: 'Summary\nCTA' },
  ],
};
const MALFORMED_META_TEXT = "Here's your outline:\n1. Intro stuff\n2. Outro stuff";

const server = setupServer(metaTextHandler(JSON.stringify(HAPPY_OUTLINE)));

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  await import('../backend/auth-server.js');
  const health = await pollHealth(`${BACKEND_BASE}/healthz`, 15_000);
  if (!health.ok) throw new Error(`backend failed to boot (${health.lastError})`);
}, 30_000);

afterAll(() => {
  server.close();
});

async function postOutline(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BACKEND_BASE}/api/generate-outline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe('T2a — Node /api/generate-outline', () => {
  it('happy path returns 200 {title, slides:[{title,content}]}', async () => {
    const { status, json } = await postOutline({
      model: 'muse-spark-1.3-contributor',
      history: [{ role: 'user', content: 'A deck about testing' }],
    });
    expect(status).toBe(200);
    expect(typeof json.title).toBe('string');
    expect(Array.isArray(json.slides)).toBe(true);
    expect(json.slides.length).toBeGreaterThan(0);
    for (const slide of json.slides) {
      expect(typeof slide.title).toBe('string');
      expect(typeof slide.content).toBe('string');
    }
    // The outline prompt is sent as the first system message (P1-5 Meta path).
    expect(captured.metaBody.messages[0].role).toBe('system');
    expect(captured.metaBody.messages[0].content).toContain('You are an expert presentation outliner');
  });

  it('malformed Meta text returns 422 {error} (P1-7 — Meta path, unchanged envelope)', async () => {
    server.use(metaTextHandler(MALFORMED_META_TEXT));
    try {
      const { status, json } = await postOutline({
        model: 'muse-spark-1.3-contributor',
        history: [{ role: 'user', content: 'A deck about testing' }],
      });
      expect(status).toBe(422);
      expect(json.error).toBe('Invalid outline JSON');
      expect(typeof json.details).toBe('string');
    } finally {
      server.resetHandlers();
    }
  });

  it('sends outline prompt as system message, not a trailing user turn (P1-5 Meta path)', async () => {
    const { status } = await postOutline({
      model: 'muse-spark-1.3-contributor',
      history: [{ role: 'user', content: 'A deck about testing' }],
    });
    expect(status).toBe(200);
    expect(captured.metaBody.messages[0].role).toBe('system');
    expect(captured.metaBody.messages[0].content).toContain(
      'You are an expert presentation outliner',
    );
    const userTexts = captured.metaBody.messages
      .filter((m: any) => m.role === 'user')
      .map((m: any) => m.content ?? '');
    expect(userTexts.some((t: string) => t.includes('You are an expert presentation outliner'))).toBe(
      false,
    );
  });

  it('omits topP from outline generation body (P1-6 Meta path)', async () => {
    const { status } = await postOutline({
      model: 'muse-spark-1.3-contributor',
      history: [{ role: 'user', content: 'A deck about testing' }],
    });
    expect(status).toBe(200);
    expect(captured.metaBody.temperature).toBe(0);
    expect(captured.metaBody).not.toHaveProperty('topP');
  });
});

describe('T2b — python-service /api/process-pptx error path', () => {
  it('missing file returns 422, never 200 (P0-4 regression gate)', async () => {
    await ensurePythonService();
    const res = await fetch(`${PYTHON_BASE}/api/process-pptx`, { method: 'POST' });
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(422);
    const body = await res.json();
    const locs = (body.detail ?? []).map((d: any) => (d.loc ?? []).join('.'));
    expect(locs.some((loc: string) => loc.includes('pptx_file'))).toBe(true);
  });
});
