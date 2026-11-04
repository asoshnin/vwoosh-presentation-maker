// Sprint 08 (F1) — shared Meta Model API mock at the HTTP boundary.
//
// Product code (backend/auth-server.js) reaches Meta via global fetch() with a
// static Bearer key. We intercept the HTTP it emits (msw/node covers fetch),
// so these mocks survive refactors that don't change the Meta endpoint shape.
//
// Auth: static MODEL_API_KEY from backend/.env — no ADC, no token lifecycle.
// Deterministic: every Meta call returns the fixed text.
import { http, HttpResponse } from 'msw';

/** Wrap raw model text in the Meta chat/completions envelope the backend parses. */
export function metaCandidateText(text: string) {
  return { choices: [{ message: { content: text } }] };
}

/** Capture slot for the last Meta request body (asserted by T2/T3). */
export const captured: { metaBody: any; calls: number } = { metaBody: null, calls: 0 };

/** Meta handler returning fixed model text and recording the request body. */
export function metaTextHandler(text: string) {
  return http.post('https://api.meta.ai/*', async ({ request }) => {
    captured.metaBody = await request.json();
    captured.calls += 1;
    return HttpResponse.json(metaCandidateText(text));
  });
}

/** Reset capture state between tests. */
export function resetCapture() {
  captured.metaBody = null;
  captured.calls = 0;
}
