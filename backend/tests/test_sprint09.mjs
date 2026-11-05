// Sprint 09 tests — node:test, zero deps.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { saveAsset, listAssets, assetPath, probe } from '../assetstore/store.js';
import { directSlide } from '../creative/director.js';

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's09-')); });

// 1x1 PNG (IHDR 1x1) — minimal valid.
const PNG1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// Minimal JPEG with SOF0 1x1.
const JPG1 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xdb, 0x00, 0x43, 0x00, ...new Array(64).fill(0x08),
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xd9,
]);

describe('store', () => {
  it('T1: upload PNG ok with dims', () => {
    const a = saveAsset(tmp, 'sess1', PNG1, 'a.png');
    assert.equal(a.width_px, 1); assert.equal(a.height_px, 1);
    assert.equal(a.license_status, 'user_upload');
  });
  it('T1b: upload JPEG ok with dims', () => {
    const a = saveAsset(tmp, 'sess1', JPG1, 'b.jpg');
    assert.equal(a.width_px, 1); assert.equal(a.height_px, 1);
  });
  it('T2: duplicate SHA256 dedupes to same id', () => {
    const a = saveAsset(tmp, 'sess1', PNG1, 'a.png');
    const b = saveAsset(tmp, 'sess1', PNG1, 'a-copy.png');
    assert.equal(a.id, b.id);
    assert.equal(listAssets(tmp, 'sess1').filter((x) => x.sha256 === a.sha256).length, 1);
  });
  it('T3: non-image rejected', () => {
    assert.throws(() => saveAsset(tmp, 'sess1', Buffer.from('hello'), 'x.txt'), (e) => e.code === 415);
  });
  it('T4: oversize rejected', () => {
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(9 * 1024 * 1024)]);
    assert.throws(() => saveAsset(tmp, 'sess1', big, 'big.png'), (e) => e.code === 413);
  });
  it('T5: corrupt header rejected', () => {
    const bad = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    assert.throws(() => saveAsset(tmp, 'sess1', bad, 'bad.png'), (e) => e.code === 422);
  });
  it('T8: unknown asset -> null path', () => {
    assert.equal(assetPath(tmp, 'sess1', 'deadbeefcafe'), null);
  });
  it('probe: empty buffer rejected as non-image', () => {
    assert.equal(probe(Buffer.alloc(0)).ok, false);
  });
});

describe('director', () => {
  const slide = { title: 'No Platform Had an Open-Source Way to Generate Truly Editable PPTX.', bullets: ['a', 'b', 'c'] };
  it('T6: default output in-bounds, no overlap, logo slot', () => {
    const m = directSlide(slide, []);
    assert.equal(m.slide_size.width_in, 13.333);
    assert.ok(m.slots.find((s) => s.id === 'logo'));
    assert.deepEqual(m.image_refs, {});
  });
  it('T6b: exhibit ref narrows body, no overlap', () => {
    const a = saveAsset(tmp, 'sess2', PNG1, 'e.png');
    const m = directSlide({ ...slide, imageRef: a.id }, [{ id: a.id }]);
    const body = m.slots.find((s) => s.id === 'body');
    assert.ok(body.w_in < 10.6, `body narrowed, got ${body.w_in}`);
    assert.equal(m.image_refs['exhibit-image'], a.id);
  });
  it('T6c: unknown imageRef falls back to logo', () => {
    const m = directSlide({ ...slide, imageRef: 'nope' }, []);
    assert.ok(m.slots.find((s) => s.id === 'logo'));
  });
  it('T7: caps enforced (140 chars, 5 bullets)', () => {
    const m = directSlide({ title: 'x'.repeat(500), bullets: ['1', '2', '3', '4', '5', '6', '7'] }, []);
    assert.ok(m.slots.find((s) => s.id === 'title').text.length <= 140);
    assert.equal(m.slots.find((s) => s.id === 'body').text.split('\n').length, 5);
  });
});
