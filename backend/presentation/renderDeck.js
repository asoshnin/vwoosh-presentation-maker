// Sprint 10 — deterministic demo-deck renderer on PptxGenJS 4.0.1.
//
// Every PptxGenJS option used here was verified against the installed package
// (backend/node_modules/pptxgenjs/types/index.d.ts + dist/pptxgen.es.js).
// Geometry: _DEVELOPMENT/40_SPRINTS/Sprint_10_demo-renderer-parity/02_design.md
import fs from 'fs';
import PptxGenJS from 'pptxgenjs';
import { DEMO_THEME, SLIDE } from './theme.js';
import { probe } from '../assetstore/store.js';
import {
  bodyFontSize,
  chooseLayout,
  containRect,
  parseBullets,
  parseMetrics,
  splitCardPoints,
  stripSlidePrefix,
  titleFontSize,
} from './normalize.js';

// Geometry contract (inches on 13.333 x 7.5).
const TITLE_BOX = { x: 0.6, y: 0.35, w: 10.6, h: 1.2 };
const ACCENT_BAR = { x: 0.6, y: 1.5, w: 2.0, h: 0.06 };
const BODY_BOX = { x: 0.6, y: 1.95, w: 12.1, h: 4.8 };
const CARD_Y = 2.05;
const CARD_H = 2.6;
const CARD_COLS = [
  { x: 0.6, w: 3.7 },
  { x: 4.7, w: 3.7 },
  { x: 8.8, w: 3.9 },
];
const SUPPORTING_BOX = { x: 0.6, y: 5.05, w: 12.1, h: 1.6 };
const LOGO_BOX = { x: 11.55, y: 0.25, width: 1.2, height: 1.2 };
const SLIDE_NUM_BOX = { x: 12.45, y: 7.05, w: 0.35, h: 0.25 };
const SOURCE_BOX = { x: 0.6, y: 6.95, w: 9.5, h: 0.3 };
const HERO_TITLE_BOX = { x: 0.7, y: 1.15, w: 7.6, h: 2.7 };
const HERO_SUB_BOX = { x: 0.7, y: 4.05, w: 7.6, h: 1.5 };
const CTA_PANEL = { x: 0.45, y: 1.15, w: 8.1, h: 4.7 };
const CTA_TITLE_BOX = { x: 0.85, y: 1.45, w: 7.3, h: 1.5 };
const CTA_BODY_BOX = { x: 0.85, y: 3.0, w: 7.3, h: 2.7 };
const CHART_BOX = { x: 0.6, y: 3.0, w: 5.6, h: 3.65 };
const CHART_BODY_BOX = { x: 6.6, y: 1.95, w: 6.1, h: 4.7 };
const APPENDIX_BODY = { x: 0.6, y: 1.95, w: 12.1 };
const PS_BOX = { x: 0.6, y: 5.7, w: 12.1, h: 1.0 };

const SHAPE_RECT = 'rect';
const SHAPE_ROUND_RECT = 'roundRect';
const CHART_BAR = 'bar';
const CARD_RADIUS = 0.08;
const METRIC_BULLET_RE = /^(.+?)\s*:\s*(.+?)\s*$/;
const PS_RE = /^\s*p\.?\s*s\.?[\s.:]+/i;
const DATA_MIME_RE = /image\/([\w+.-]+)/i;
const LOCAL_PATH_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function toPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

// PNG/JPEG via magic bytes (mirrors assetstore/store.js); SVG via markup head.
function detectKind(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 5) {
    const head = bytes.subarray(0, Math.min(bytes.length, 2048)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    if (head.startsWith('<') && /<svg[\s>/]/i.test(head)) return 'svg';
  }
  return null;
}

function probedDims(kind, bytes) {
  if (kind !== 'png' && kind !== 'jpeg') return null;
  const p = probe(bytes);
  return p.ok ? { width: p.w, height: p.h } : null;
}

function dataUri(kind, bytes) {
  const sub = kind === 'png' ? 'png' : kind === 'jpeg' ? 'jpeg' : 'svg+xml';
  return `image/${sub};base64,${bytes.toString('base64')}`;
}

function fromBytes(bytes, what) {
  if (!bytes || bytes.length === 0) throw coded(422, `${what}: empty image`);
  const kind = detectKind(bytes);
  if (!kind) throw coded(422, `${what}: unsupported image MIME (expected PNG, JPEG, or SVG)`);
  return { data: dataUri(kind, bytes), path: null, kind, ...probedDims(kind, bytes) };
}

function fromBase64Payload(payload, declared, what) {
  const bytes = Buffer.from(String(payload || '').trim(), 'base64');
  if (bytes.length === 0) throw coded(422, `${what}: empty image`);
  const kind = detectKind(bytes);
  if (kind) return { data: dataUri(kind, bytes), path: null, kind, ...probedDims(kind, bytes) };
  // Trust an explicit SVG declaration when byte sniffing finds no raster magic.
  if (declared === 'svg+xml' || declared === 'svg') {
    return { data: `image/svg+xml;base64,${bytes.toString('base64')}`, path: null, kind: 'svg' };
  }
  throw coded(422, `${what}: unsupported image MIME (expected PNG, JPEG, or SVG)`);
}

function fromString(input, what) {
  const s = String(input).trim();
  if (!s) throw coded(422, `${what}: empty image`);
  const b64at = s.toLowerCase().indexOf('base64,');
  if (b64at >= 0) {
    const declared = (DATA_MIME_RE.exec(s.slice(0, b64at)) || [])[1];
    return fromBase64Payload(s.slice(b64at + 'base64,'.length), (declared || '').toLowerCase(), what);
  }
  if (s.startsWith('data:')) {
    const comma = s.indexOf(',');
    const svgText = comma >= 0 ? decodeURIComponent(s.slice(comma + 1)) : '';
    if (!svgText.trimStart().startsWith('<')) throw coded(422, `${what}: unsupported image MIME (expected PNG, JPEG, or SVG)`);
    return fromBytes(Buffer.from(svgText, 'utf8'), what);
  }
  if (s.startsWith('<')) return fromBytes(Buffer.from(s, 'utf8'), what);
  return fromBase64Payload(s, '', what);
}

function fromObject(obj, what) {
  const inner = obj.data ?? obj.buffer ?? obj.bytes ?? obj.dataUri ?? obj.dataURI ?? obj.src ?? null;
  let base = null;
  if (typeof inner === 'string' || Buffer.isBuffer(inner) || inner instanceof Uint8Array) {
    base = normalizeImageInput(inner, what);
  } else if (typeof obj.path === 'string' && obj.path) {
    base = { data: null, path: obj.path, kind: null };
    if (!LOCAL_PATH_RE.test(obj.path)) {
      try {
        const bytes = fs.readFileSync(obj.path);
        const kind = detectKind(bytes);
        if (kind === 'png' || kind === 'jpeg') Object.assign(base, { kind }, probedDims(kind, bytes));
      } catch { /* dims stay unknown; zero-crop fallback applies */ }
    }
  } else {
    throw coded(422, `${what}: no image data`);
  }
  const w = toPositiveNumber(obj.width ?? obj.w ?? obj.naturalWidth ?? obj.width_px);
  const h = toPositiveNumber(obj.height ?? obj.h ?? obj.naturalHeight ?? obj.height_px);
  if (w && h) {
    base.width = w;
    base.height = h;
  }
  return base;
}

// Accepts data URI, pptx-style `image/..;base64,..`, raw base64, raw SVG text,
// Buffer/Uint8Array bytes, or {data|buffer|bytes|dataUri|src|path, width|height, ...}.
// Returns {data, path, kind, width?, height?}; null input -> null (caller skips).
function normalizeImageInput(input, what) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') return fromString(input, what);
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    return fromBytes(Buffer.isBuffer(input) ? input : Buffer.from(input), what);
  }
  if (typeof input === 'object') return fromObject(input, what);
  throw coded(422, `${what}: unsupported image input`);
}

function resolveAccent(brandKit) {
  const raw = String(brandKit?.color ?? '').trim().replace(/^#/, '');
  const hex = /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : null;
  if (hex && hex !== '0072C6') return hex;
  if (hex === '0072C6' && brandKit?.themePreset) return hex;
  return DEMO_THEME.accent;
}

function resolveLogo(brandKit) {
  if (!brandKit?.logo) return null;
  const img = normalizeImageInput(brandKit.logo, 'logo');
  const w = toPositiveNumber(brandKit.logoMeta?.width);
  const h = toPositiveNumber(brandKit.logoMeta?.height);
  if (w && h) return { ...img, width: w, height: h };
  if (img.width && img.height) return img;
  return { ...img, width: 1, height: 1 }; // SVG / unknown dims: square box default
}

function resolveBackground(index, layout, assetsByRole, assetsBySlide) {
  const n = index + 1;
  const perSlide = assetsBySlide?.[n] ?? assetsBySlide?.[String(n)];
  if (perSlide) return normalizeImageInput(perSlide, `slide ${n} image`);
  if (n === 1 && assetsByRole?.hero) return normalizeImageInput(assetsByRole.hero, 'hero image');
  if (layout === 'cta' && assetsByRole?.cta) return normalizeImageInput(assetsByRole.cta, 'CTA image');
  return null;
}

// Centered crop-to-fill window in natural-aspect shape coordinates.
// PptxGenJS `sizing.crop` percentages are relative to the shape w/h we pass,
// so encoding the probed aspect ratio in the shape yields a true centered crop
// with zero distortion (verified against ImageSizingXml.crop in dist).
function coverCrop(naturalWidth, naturalHeight, box) {
  const natRatio = naturalWidth / naturalHeight;
  const boxRatio = box.w / box.h;
  if (natRatio >= boxRatio) {
    const shapeW = box.h * natRatio;
    return {
      shape: { w: shapeW, h: box.h },
      sizing: { type: 'crop', w: box.w, h: box.h, x: (shapeW - box.w) / 2, y: 0 },
    };
  }
  const shapeH = box.w / natRatio;
  return {
    shape: { w: box.w, h: shapeH },
    sizing: { type: 'crop', w: box.w, h: box.h, x: 0, y: (shapeH - box.h) / 2 },
  };
}

function drawFullBleed(slide, img) {
  const box = { x: 0, y: 0, w: SLIDE.width, h: SLIDE.height };
  const opts = {
    ...(img.data ? { data: img.data } : { path: img.path }),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
  };
  if (img.width && img.height) {
    const { shape, sizing } = coverCrop(img.width, img.height, box);
    opts.w = round4(shape.w);
    opts.h = round4(shape.h);
    opts.sizing = { type: sizing.type, w: round4(sizing.w), h: round4(sizing.h), x: round4(sizing.x), y: round4(sizing.y) };
  }
  // Unknown dims (SVG / remote path): zero-crop stretch fallback, documented.
  slide.addImage(opts);
}

function drawLogo(slide, logo) {
  const r = containRect(logo.width, logo.height, LOGO_BOX);
  slide.addImage({
    ...(logo.data ? { data: logo.data } : { path: logo.path }),
    x: round4(r.x),
    y: round4(r.y),
    w: round4(r.width),
    h: round4(r.height),
  });
}

function drawTitle(slide, title, box, fontSize, color, fontFace) {
  slide.addText(title || ' ', {
    ...box,
    fontSize,
    color,
    fontFace,
    bold: true,
    align: 'left',
    valign: 'middle',
    margin: 0,
  });
}

function drawAccentBar(slide, accent) {
  slide.addShape(SHAPE_RECT, { ...ACCENT_BAR, fill: { color: accent } });
}

function drawBody(slide, points, box, { fontSize, color, fontFace, bullet, paraSpaceAfter = 4 }) {
  if (!points.length) return;
  slide.addText(
    points.map((text, i) => ({ text, options: i < points.length - 1 ? { breakLine: true } : {} })),
    { ...box, fontSize, color, fontFace, bullet, align: 'left', valign: 'top', margin: 0, paraSpaceAfter },
  );
}

function isMetricBullet(point) {
  const match = METRIC_BULLET_RE.exec(String(point ?? ''));
  if (!match) return false;
  const value = Number(match[2].replace(/[$,%\s]/g, ''));
  return match[1].trim().length > 0 && Number.isFinite(value);
}

function renderHero(slide, title, content) {
  drawTitle(slide, title, HERO_TITLE_BOX, titleFontSize(title, 'hero'), DEMO_THEME.body, DEMO_THEME.titleFont);
  drawBody(slide, parseBullets(content, 5), HERO_SUB_BOX, {
    fontSize: 20,
    color: DEMO_THEME.muted,
    fontFace: DEMO_THEME.bodyFont,
    bullet: false,
    paraSpaceAfter: 6,
  });
}

function renderCards(slide, title, content, accent) {
  drawTitle(slide, title, TITLE_BOX, titleFontSize(title, 'cards'), accent, DEMO_THEME.titleFont);
  drawAccentBar(slide, accent);
  const { cards, supporting } = splitCardPoints(parseBullets(content, 6));
  cards.forEach((card, i) => {
    const col = CARD_COLS[Math.min(i, CARD_COLS.length - 1)];
    const runs = card.heading
      ? [
        { text: card.heading, options: { fontSize: 20, bold: true, color: accent, fontFace: DEMO_THEME.titleFont, paraSpaceAfter: 6 } },
        { text: card.body, options: { fontSize: 14, color: DEMO_THEME.body, fontFace: DEMO_THEME.bodyFont } },
      ]
      : [{ text: card.body, options: { fontSize: 16, color: DEMO_THEME.body, fontFace: DEMO_THEME.bodyFont } }];
    slide.addText(runs, {
      x: col.x,
      y: CARD_Y,
      w: col.w,
      h: CARD_H,
      shape: SHAPE_ROUND_RECT,
      rectRadius: CARD_RADIUS,
      fill: { color: DEMO_THEME.surface },
      line: { color: accent, width: 1 },
      align: 'left',
      valign: 'top',
    });
  });
  drawBody(slide, supporting, SUPPORTING_BOX, {
    fontSize: Math.min(bodyFontSize(supporting, 'cards'), 15),
    color: DEMO_THEME.muted,
    fontFace: DEMO_THEME.bodyFont,
    bullet: false,
    paraSpaceAfter: 2,
  });
}

function renderStandard(slide, title, content, accent) {
  drawTitle(slide, title, TITLE_BOX, titleFontSize(title, 'standard'), accent, DEMO_THEME.titleFont);
  drawAccentBar(slide, accent);
  const points = parseBullets(content, 5);
  drawBody(slide, points, BODY_BOX, {
    fontSize: bodyFontSize(points, 'standard'),
    color: DEMO_THEME.body,
    fontFace: DEMO_THEME.bodyFont,
    bullet: true,
  });
}

function renderChart(slide, title, content, accent, metrics) {
  drawTitle(slide, title, TITLE_BOX, titleFontSize(title, 'chart'), accent, DEMO_THEME.titleFont);
  drawAccentBar(slide, accent);
  const labels = metrics.map((m) => m.label);
  const values = metrics.map((m) => m.value);
  const colors = values.length > 1
    ? [...values.slice(0, -1).map(() => DEMO_THEME.muted), accent]
    : [accent];
  slide.addChart(CHART_BAR, [{ name: '', labels, values }], {
    ...CHART_BOX,
    barDir: 'col',
    barGrouping: 'clustered',
    showTitle: false,
    showLegend: false,
    chartColors: colors,
    catAxisLabelColor: 'FFFFFF',
    catAxisLabelFontFace: 'Calibri',
    catAxisLabelFontSize: 11,
    catAxisLineColor: DEMO_THEME.muted,
    valAxisLabelColor: 'FFFFFF',
    valAxisLabelFontFace: 'Calibri',
    valAxisLabelFontSize: 11,
    valAxisLineColor: DEMO_THEME.muted,
  });
  const body = parseBullets(content, Number.MAX_SAFE_INTEGER).filter((p) => !isMetricBullet(p)).slice(0, 5);
  drawBody(slide, body, CHART_BODY_BOX, {
    fontSize: bodyFontSize(body, 'chart'),
    color: DEMO_THEME.body,
    fontFace: DEMO_THEME.bodyFont,
    bullet: true,
  });
}

function renderCta(slide, title, content, accent) {
  slide.addShape(SHAPE_RECT, { ...CTA_PANEL, fill: { color: DEMO_THEME.surface } });
  drawTitle(slide, title, CTA_TITLE_BOX, titleFontSize(title, 'cta'), accent, DEMO_THEME.titleFont);
  drawBody(slide, parseBullets(content, 5), CTA_BODY_BOX, {
    fontSize: 18,
    color: DEMO_THEME.body,
    fontFace: DEMO_THEME.bodyFont,
    bullet: false,
    paraSpaceAfter: 6,
  });
}

function renderAppendix(slide, title, content, accent) {
  drawTitle(slide, title, TITLE_BOX, titleFontSize(title, 'appendix'), accent, DEMO_THEME.appendixFont);
  drawAccentBar(slide, accent);
  const points = parseBullets(content, Number.MAX_SAFE_INTEGER);
  const ps = points.filter((p) => PS_RE.test(p));
  const body = points.filter((p) => !PS_RE.test(p)).slice(0, 6);
  drawBody(slide, body, { ...APPENDIX_BODY, h: ps.length ? 3.5 : 4.8 }, {
    fontSize: bodyFontSize(body.length ? body : points, 'appendix'),
    color: DEMO_THEME.body,
    fontFace: DEMO_THEME.appendixFont,
    bullet: true,
  });
  if (ps.length) {
    slide.addText(
      ps.map((text, i) => ({ text, options: i < ps.length - 1 ? { breakLine: true } : {} })),
      {
        ...PS_BOX,
        fontSize: 15,
        bold: true,
        color: accent,
        fontFace: DEMO_THEME.appendixFont,
        align: 'left',
        valign: 'top',
        margin: 0,
      },
    );
  }
}

function cleanMetrics(slide) {
  const metrics = parseMetrics(slide);
  if (!metrics) return null;
  const clean = metrics.filter((m) => m.label && Number.isFinite(m.value));
  return clean.length ? clean : null;
}

export async function renderPresentation({ outline, brandKit, assetsByRole, assetsBySlide } = {}) {
  if (!outline || !Array.isArray(outline.slides) || outline.slides.length === 0) {
    throw coded(400, 'outline with at least one slide is required');
  }
  const kit = brandKit ?? {};
  const accent = resolveAccent(kit);
  const logo = resolveLogo(kit);
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  const total = outline.slides.length;
  outline.slides.forEach((raw, index) => {
    const slideData = raw ?? {};
    let layout = chooseLayout(slideData, index, total, {});
    let metrics = null;
    if (layout === 'chart') {
      metrics = cleanMetrics(slideData);
      if (!metrics) layout = 'standard'; // never fabricate chart data
    }
    const slide = pres.addSlide();
    slide.background = { color: DEMO_THEME.background };
    const bg = resolveBackground(index, layout, assetsByRole, assetsBySlide);
    if (bg) drawFullBleed(slide, bg);
    const title = stripSlidePrefix(slideData.title ?? '');
    const { content } = slideData;
    if (layout === 'hero') renderHero(slide, title, content);
    else if (layout === 'cards') renderCards(slide, title, content, accent);
    else if (layout === 'chart') renderChart(slide, title, content, accent, metrics);
    else if (layout === 'cta') renderCta(slide, title, content, accent);
    else if (layout === 'appendix') renderAppendix(slide, title, content, accent);
    else renderStandard(slide, title, content, accent);
    if (logo) drawLogo(slide, logo);
    slide.addText(String(index + 1), {
      ...SLIDE_NUM_BOX,
      fontSize: 10,
      color: DEMO_THEME.muted,
      fontFace: DEMO_THEME.bodyFont,
      align: 'right',
      valign: 'middle',
      margin: 0,
    });
    const source = typeof slideData.source === 'string' ? slideData.source.trim() : '';
    if (source) {
      slide.addText(source, {
        ...SOURCE_BOX,
        fontSize: 10,
        color: DEMO_THEME.muted,
        fontFace: DEMO_THEME.bodyFont,
        align: 'left',
        valign: 'middle',
        margin: 0,
      });
    }
  });
  const out = await pres.write('nodebuffer');
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
