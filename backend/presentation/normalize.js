const LEADING_MARKERS = /^[•●○▪▫*·]+\s*/;
const LEADING_HYPHENS = /^(?:-\s*)+/;
const SLIDE_PREFIX = /^\s*slide\s*\d+\s*[:.\-–—]\s*/i;
const APPENDIX_TITLE = /^\s*appendix\b/i;
const CTA_KEYWORDS =
  /next steps?|call to action|get started|contact(\s+us)?|thank\s+you|questions\?|let'?s talk|join(\s+us)?|sign\s*up|learn more|\bcta\b/i;

function contentText(content) {
  if (Array.isArray(content)) return content.map((c) => String(c ?? '')).join('\n');
  return String(content ?? '');
}

export function stripSlidePrefix(title) {
  if (title === null || title === undefined) return '';
  return String(title).replace(SLIDE_PREFIX, '');
}

export function parseBullets(content, max = 6) {
  const chunks = Array.isArray(content)
    ? content.flatMap((c) => String(c ?? '').split(/\r?\n/))
    : String(content ?? '').split(/\r?\n/);
  const bullets = [];
  for (const chunk of chunks) {
    for (const part of String(chunk).split(';')) {
      const cleaned = String(part)
        .trim()
        .replace(LEADING_MARKERS, '')
        .replace(LEADING_HYPHENS, '')
        .trim();
      if (cleaned) bullets.push(cleaned);
    }
  }
  return bullets.slice(0, max);
}

const CARD_SEPARATORS = [/\s*—\s*/, /\s*–\s*/, /:\s+/, /\.\s+/];

export function splitCardPoint(point) {
  const text = String(point ?? '');
  for (const sep of CARD_SEPARATORS) {
    const match = sep.exec(text);
    if (!match || match.index === 0) continue;
    const heading = text.slice(0, match.index).trim();
    const body = text.slice(match.index + match[0].length).trim();
    if (!heading || !body) continue;
    if (heading.split(/\s+/).length <= 7) return { heading, body };
  }
  return { heading: null, body: text };
}

export function splitCardPoints(points) {
  const list = (Array.isArray(points) ? points : [points])
    .map((p) => String(p ?? '').trim())
    .filter(Boolean);
  return {
    cards: list.slice(0, 3).map(splitCardPoint),
    supporting: list.slice(3),
  };
}

export function parseMetrics(slide) {
  if (Array.isArray(slide?.metrics) && slide.metrics.length > 0) {
    return slide.metrics.map((m) => ({
      label: String(m?.label ?? '').trim(),
      value: Number(m?.value),
    }));
  }
  const found = [];
  for (const bullet of parseBullets(slide?.content, Number.MAX_SAFE_INTEGER)) {
    const match = /^(.+?)\s*:\s*(.+?)\s*$/.exec(bullet);
    if (!match) continue;
    const value = Number(match[2].replace(/[$,%\s]/g, ''));
    if (match[1].trim() && Number.isFinite(value)) {
      found.push({ label: match[1].trim(), value });
    }
  }
  return found.length >= 2 ? found : null;
}

export function chooseLayout(slide, index = 0, totalSlides = 1, context = {}) {
  const s = slide ?? {};
  if (s.layout) return s.layout;
  const title = stripSlidePrefix(s.title ?? '');
  if (s.appendix === true || context?.appendix === true || APPENDIX_TITLE.test(title)) {
    return 'appendix';
  }
  if (parseMetrics(s) !== null) return 'chart';
  if (index === 0) return 'hero';
  const haystack = `${title}\n${contentText(s.content)}`;
  if (CTA_KEYWORDS.test(haystack)) return 'cta';
  const structured = parseBullets(s.content).filter((p) => splitCardPoint(p).heading !== null);
  if (structured.length >= 3) return 'cards';
  return 'standard';
}

export function titleFontSize(title, layout) {
  const len = String(title ?? '').length;
  if (layout === 'hero') return len <= 30 ? 40 : len <= 60 ? 34 : 30;
  return len <= 30 ? 30 : len <= 60 ? 27 : 24;
}

export function bodyFontSize(points, layout) {
  const list = Array.isArray(points) ? points : parseBullets(points);
  const chars = list.join(' ').length;
  if (layout === 'appendix') return chars > 300 || list.length > 4 ? 14 : 15;
  if (chars > 400 || list.length > 4) return 14;
  if (chars > 250 || list.length > 3) return 15;
  return 16;
}

export function containRect(naturalWidth, naturalHeight, box) {
  const nw = Number(naturalWidth);
  const nh = Number(naturalHeight);
  const b = box ?? {};
  const bw = Number(b.width);
  const bh = Number(b.height);
  if (![nw, nh, bw, bh].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError('containRect requires positive finite dimensions');
  }
  const scale = Math.min(bw / nw, bh / nh);
  const width = nw * scale;
  const height = nh * scale;
  return {
    x: (Number(b.x) || 0) + (bw - width) / 2,
    y: (Number(b.y) || 0) + (bh - height) / 2,
    width,
    height,
  };
}
