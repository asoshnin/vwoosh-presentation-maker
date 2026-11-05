// Sprint 09 — creative director: outline slide + library + template -> S1-shaped manifest.
// Fixed-slot composer: geometry comes from the template pack (pre-validated S1-safe),
// so output is valid by construction. No free geometry, no auto-repair.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK = JSON.parse(fs.readFileSync(path.join(__dirname, 'mckinsey.json'), 'utf8'));

const ALLOWED_LICENSES = new Set(PACK.license_policy.allowed);

export function getTemplate(templateId = 'mckinsey') {
  if (templateId !== 'mckinsey') throw Object.assign(new Error(`unknown template ${templateId}`), { code: 404 });
  return PACK;
}

/**
 * slide: {title, bullets[], imageRef?: assetId|null, source?: string}
 * library: [{id}] — session asset index (ids only; bytes resolved at render time)
 */
export function directSlide(slide, library = [], templateId = 'mckinsey') {
  const t = getTemplate(templateId);
  const libIds = new Set((library || []).map((a) => a.id));
  const title = String(slide.title || '').slice(0, t.slots.title.max_chars);
  const bullets = (slide.bullets || []).slice(0, t.slots.body.max_bullets).map(String);

  const hasExhibit = !!(slide.imageRef && libIds.has(slide.imageRef));
  // Exhibit occupies right column: narrow body to avoid overlap (S1 interior rule).
  const bodyGeo = hasExhibit
    ? { x_in: 0.6, y_in: 2.0, w_in: 7.3, h_in: 4.9, z_order: 2 }
    : geo(t.slots.body);
  const slots = [
    { id: 'title', kind: 'text', ...geo(t.slots.title), text: title, role: 'title' },
    { id: 'body', kind: 'text', ...bodyGeo, text: bullets.map((b) => `• ${b}`).join('\n'), role: 'body' },
  ];

  // Image slot: explicit user ref wins (must exist in library); else logo default.
  if (hasExhibit) {
    slots.push({
      id: 'exhibit-image', kind: 'image', ...geo(t.slots.exhibit),
      image_meta: { source_kind: 'user_upload', license_status: 'user_upload', alt_text: slide.imageAlt || 'user image' },
      _asset_ref: slide.imageRef,
    });
  } else {
    slots.push({ id: 'logo', kind: 'image', ...geo(t.slots.logo), image_meta: { source_kind: 'icon', license_status: 'icon', alt_text: 'Vwoosh logo' } });
  }

  if (slide.source) {
    slots.push({ id: 'source', kind: 'text', ...geo(t.slots.source), text: `Source: ${slide.source}`, role: 'source' });
  }

  const manifest = {
    slide_size: { width_in: t.slide_size.width_in, height_in: t.slide_size.height_in },
    template_id: t.template_id,
    slots: slots.map(({ _asset_ref, ...s }) => s),
    image_refs: Object.fromEntries(
      slots.filter((s) => s._asset_ref).map((s) => [s.id, s._asset_ref]),
    ),
  };
  assertS1Safe(manifest);
  return manifest;
}

function geo(s) {
  return { x_in: s.x_in, y_in: s.y_in, w_in: s.w_in, h_in: s.h_in, z_order: s.z_order };
}

// Runtime S1-shape guard: bounds + no-overlap + license enum (mirrors Python S1 rules).
function assertS1Safe(manifest) {
  const W = manifest.slide_size.width_in, H = manifest.slide_size.height_in;
  const boxes = [];
  for (const s of manifest.slots) {
    if (s.x_in < 0 || s.y_in < 0 || s.x_in + s.w_in > W + 1e-9 || s.y_in + s.h_in > H + 1e-9) {
      throw Object.assign(new Error(`SLOT_OUT_OF_BOUNDS: ${s.id}`), { code: 422 });
    }
    if (s.kind === 'image' && s.image_meta && !ALLOWED_LICENSES.has(s.image_meta.license_status)) {
      throw Object.assign(new Error(`LICENSE: ${s.id}`), { code: 422 });
    }
    boxes.push(s);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x_in < b.x_in + b.w_in && a.x_in + a.w_in > b.x_in && a.y_in < b.y_in + b.h_in && a.y_in + a.h_in > b.y_in) {
        // logo-over-title-corner is by design; exhibit never coexists with logo.
        throw Object.assign(new Error(`SLOT_OVERLAP: ${a.id} x ${b.id}`), { code: 422 });
      }
    }
  }
}
