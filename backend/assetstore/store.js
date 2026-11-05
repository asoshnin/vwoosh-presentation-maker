// Sprint 09 — asset store (additive, zero new deps).
// Session-scoped image library: magic-byte gate, dimension probe, SHA256 dedupe, 50 MB LRU.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const SESSION_CAP_BYTES = 50 * 1024 * 1024;
const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function sanitizeSession(raw) {
  const s = String(raw || 'anon').slice(0, 64);
  if (!SESSION_RE.test(s)) throw Object.assign(new Error('bad session id'), { code: 400 });
  return s;
}

export function dataRoot(baseDir) {
  const d = path.join(baseDir, '.data', 'assets');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function sessionDir(baseDir, session) {
  const d = path.join(dataRoot(baseDir), sanitizeSession(session));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function detectImage(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

function pngDims(buf) {
  // IHDR width/height at offsets 16/20 (big-endian), validated by length.
  if (buf.length < 24) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function jpegDims(buf) {
  // Walk markers to first SOF (C0-C3, C5-C7, C9-CB, CD-CF).
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (len < 2) break;
    i += 2 + len;
  }
  return null;
}

export function probe(buf) {
  const kind = detectImage(buf);
  if (!kind) return { ok: false, code: 415, message: 'not a PNG or JPEG image' };
  if (buf.length > MAX_FILE_BYTES) return { ok: false, code: 413, message: 'file exceeds 8 MB' };
  const dims = kind === 'png' ? pngDims(buf) : jpegDims(buf);
  if (!dims || !dims.w || !dims.h) return { ok: false, code: 422, message: 'corrupt image header' };
  return { ok: true, kind, ...dims };
}

function dirSize(dir) {
  let total = 0;
  for (const f of fs.readdirSync(dir)) {
    try { total += fs.statSync(path.join(dir, f)).size; } catch { /* raced delete */ }
  }
  return total;
}

function evictLRU(dir, needBytes) {
  const files = fs.readdirSync(dir)
    .map((f) => { try { const st = fs.statSync(path.join(dir, f)); return { f, mtime: st.mtimeMs, size: st.size }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => a.mtime - b.mtime);
  let total = files.reduce((t, x) => t + x.size, 0);
  for (const x of files) {
    if (total + needBytes <= SESSION_CAP_BYTES) break;
    try { fs.unlinkSync(path.join(dir, x.f)); total -= x.size; } catch { /* ignore */ }
  }
}

export function saveAsset(baseDir, session, buffer, origName) {
  const dir = sessionDir(baseDir, session);
  const p = probe(buffer);
  if (!p.ok) throw Object.assign(new Error(p.message), { code: p.code });
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const id = sha256.slice(0, 12);
  const ext = p.kind === 'png' ? 'png' : 'jpg';
  const file = path.join(dir, `${sha256}.${ext}`);
  if (!fs.existsSync(file)) {
    evictLRU(dir, buffer.length);
    fs.writeFileSync(file, buffer);
  }
  return {
    id, sha256,
    mime: p.kind === 'png' ? 'image/png' : 'image/jpeg',
    width_px: p.w, height_px: p.h,
    license_status: 'user_upload',
    created_at: new Date().toISOString(),
    stored_name: path.basename(file),
    orig_name: String(origName || '').slice(0, 128),
  };
}

export function listAssets(baseDir, session) {
  const dir = sessionDir(baseDir, session);
  return fs.readdirSync(dir)
    .filter((f) => /\.(png|jpg)$/i.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { stored_name: f, sha256: f.replace(/\.[^.]+$/, ''), id: f.slice(0, 12), size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export function assetPath(baseDir, session, id) {
  const dir = sessionDir(baseDir, session);
  const hit = fs.readdirSync(dir).find((f) => f.startsWith(String(id)) && /\.(png|jpg)$/i.test(f));
  return hit ? path.join(dir, hit) : null;
}
