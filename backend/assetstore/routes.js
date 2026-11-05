// Sprint 09 — asset routes (additive router, mounted at /api/assets).
// Upload contract: JSON {filename, data_base64} (no multer dep by design).
import { Router } from 'express';
import { assetPath, listAssets, sanitizeSession, saveAsset } from './store.js';

export function assetRouter(baseDir) {
  const r = Router();

  const sessionOf = (req) => {
    try { return sanitizeSession(req.get('X-Session-Id') || 'anon'); }
    catch { return null; }
  };

  r.post('/', (req, res) => {
    const session = sessionOf(req);
    if (!session) return res.status(400).json({ error: { code: 'BAD_SESSION', message: 'invalid X-Session-Id' } });
    const { filename, data_base64 } = req.body || {};
    if (typeof data_base64 !== 'string' || !data_base64.length) {
      return res.status(422).json({ error: { code: 'MISSING_DATA', message: 'data_base64 required' } });
    }
    let buf;
    try { buf = Buffer.from(data_base64, 'base64'); }
    catch { return res.status(422).json({ error: { code: 'BAD_BASE64', message: 'invalid base64' } }); }
    if (!buf.length) return res.status(422).json({ error: { code: 'EMPTY_FILE', message: 'empty upload' } });
    try {
      const a = saveAsset(baseDir, session, buf, filename);
      return res.status(201).json({
        id: a.id, width_px: a.width_px, height_px: a.height_px,
        license_status: a.license_status, thumb_url: `/api/assets/${a.id}/file`,
      });
    } catch (e) {
      const code = [413, 415, 422].includes(e.code) ? e.code : 500;
      return res.status(code).json({ error: { code: 'UPLOAD_REJECTED', message: e.message } });
    }
  });

  r.get('/', (req, res) => {
    const session = sessionOf(req);
    if (!session) return res.status(400).json({ error: { code: 'BAD_SESSION', message: 'invalid X-Session-Id' } });
    const items = listAssets(baseDir, session).map((a) => ({
      id: a.id, thumb_url: `/api/assets/${a.id}/file`, license_status: 'user_upload',
    }));
    return res.json({ assets: items });
  });

  r.get('/:id/file', (req, res) => {
    const session = sessionOf(req);
    if (!session) return res.status(400).json({ error: { code: 'BAD_SESSION', message: 'invalid X-Session-Id' } });
    const p = assetPath(baseDir, session, req.params.id);
    if (!p) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `asset ${req.params.id} not found` } });
    return res.sendFile(p);
  });

  return r;
}
