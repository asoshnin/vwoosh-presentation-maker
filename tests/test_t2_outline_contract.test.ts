// Sprint 02 (P0-5) T2 — outline + python error contracts (vitest).
//
// T2a (Node POST /api/generate-outline, Vertex mocked at the fetch boundary):
//   - happy: Vertex returns a JSON string -> 200 {title, slides:[{title,content}]}
//   - malformed: Vertex returns prose -> CURRENTLY 500 {error, details}.
//     Correct-by-accident until P1-7 lands schema validation (-> 422); the
//     Sprint 04 fix is the red->green flip, so this pins today's behaviour.
// T2b (python-service POST /api/process-pptx, hit directly): missing-file
//   error path returns 422 (P0-4 fix) and must never regress to 200.
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captured,
  ensureFakeAdc,
  oauthHandler,
  vertexTextHandler,
} from './helpers/vertex-mock';
import { BACKEND_BASE, PYTHON_BASE, ensurePythonService, pollHealth } from './helpers/services';

ensureFakeAdc();

const HAPPY_OUTLINE = {
  title: ' contracted outline ',
  slides: [
    { title: 'Slide 1: Intro', content: 'Hook\nProblem\nSolution' },
    { title: 'Slide 2: Outro', content: 'Summary\nCTA' },
  ],
};
const MALFORMED_VERTEX_TEXT = "Here's your outline:\n1. Intro stuff\n2. Outro stuff";

const server = setupServer(oauthHandler, vertexTextHandler(JSON.stringify(HAPPY_OUTLINE)));

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
      model: 'gemini-2.0-flash',
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
    // The outline prompt is appended after the client history.
    expect(captured.vertexBody.contents.at(-1).role).toBe('user');
  });

  it('malformed Vertex text currently returns 500 {error, details} (P1-7 will flip to 422)', async () => {
    server.use(vertexTextHandler(MALFORMED_VERTEX_TEXT));
    try {
      const { status, json } = await postOutline({
        model: 'gemini-2.0-flash',
        history: [{ role: 'user', content: 'A deck about testing' }],
      });
      expect(status).toBe(500);
      expect(json.error).toBe('Failed to generate outline');
      expect(typeof json.details).toBe('string');
      expect(json.details).toMatch(/not valid JSON/);
    } finally {
      server.resetHandlers();
    }
  });

  it('sends outline prompt as systemInstruction, not a trailing user turn (P1-5)', async () => {
    const { status } = await postOutline({
      model: 'gemini-2.0-flash',
      history: [{ role: 'user', content: 'A deck about testing' }],
    });
    expect(status).toBe(200);
    expect(captured.vertexBody.systemInstruction).toBeDefined();
    expect(captured.vertexBody.systemInstruction.parts[0].text).toContain(
      'You are an expert presentation outliner',
    );
    const texts = captured.vertexBody.contents.map((c: any) => c.parts?.[0]?.text ?? '');
    expect(texts.some((t: string) => t.includes('You are an expert presentation outliner'))).toBe(
      false,
    );
  });

  it('omits topP from outline generationConfig (P1-6)', async () => {
    const { status } = await postOutline({
      model: 'gemini-2.0-flash',
      history: [{ role: 'user', content: 'A deck about testing' }],
    });
    expect(status).toBe(200);
    expect(captured.vertexBody.generationConfig.temperature).toBe(0);
    expect(captured.vertexBody.generationConfig).not.toHaveProperty('topP');
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
