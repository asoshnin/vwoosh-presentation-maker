// Sprint 02 (P0-5) — shared Vertex + Google OAuth mocks at the HTTP boundary.
//
// Product code (backend/auth-server.js) reaches Vertex via global fetch() and
// mints tokens via google-auth-library (ADC). Both stay untouched: we only
// intercept the HTTP they emit (msw/node covers fetch AND https.request, so
// these mocks survive the P2-3 vertexGenerate() extraction unchanged).
//
// Auth works because GOOGLE_APPLICATION_CREDENTIALS points at a fake
// service-account key whose RSA key is generated at runtime — no committed
// key material, no network, deterministic 's02-test-token'.
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http, HttpResponse } from 'msw';

let adcReady = false;

/** Install fake ADC (idempotent across test files in the shared worker). */
export function ensureFakeAdc(): string {
  if (adcReady && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const adcPath = join(tmpdir(), `s02-fake-adc-${randomUUID()}.json`);
  writeFileSync(
    adcPath,
    JSON.stringify({
      type: 'service_account',
      project_id: 's02-harness',
      private_key_id: 's02-test-key',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      client_email: 's02-harness@s02-harness.iam.gserviceaccount.com',
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
  );
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
  adcReady = true;
  return adcPath;
}

/** Wrap raw model text in the Vertex generateContent envelope the backend parses. */
export function vertexCandidateText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

/** OAuth2 token endpoint: every ADC refresh gets the same test token. */
export const oauthHandler = http.post('https://oauth2.googleapis.com/token', () =>
  HttpResponse.json({ access_token: 's02-test-token', expires_in: 3600, token_type: 'Bearer' }),
);

/** Capture slot for the last Vertex request body (asserted by T2/T3). */
export const captured: { vertexBody: any } = { vertexBody: null };

/** Vertex handler returning fixed model text and recording the request body. */
export function vertexTextHandler(text: string) {
  return http.post('https://aiplatform.googleapis.com/*', async ({ request }) => {
    captured.vertexBody = await request.json();
    return HttpResponse.json(vertexCandidateText(text));
  });
}
