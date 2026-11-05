import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripSlidePrefix,
  parseBullets,
  splitCardPoint,
  splitCardPoints,
  chooseLayout,
  titleFontSize,
  bodyFontSize,
  containRect,
  parseMetrics,
} from '../presentation/normalize.js';

describe('stripSlidePrefix', () => {
  it('strips "Slide N:" prefixes', () => {
    assert.equal(stripSlidePrefix('Slide 3: Market Overview'), 'Market Overview');
    assert.equal(stripSlidePrefix('slide 12 - Roadmap'), 'Roadmap');
    assert.equal(stripSlidePrefix('Slide 1. Title'), 'Title');
  });
  it('leaves plain titles untouched', () => {
    assert.equal(stripSlidePrefix('Market Overview'), 'Market Overview');
    assert.equal(stripSlidePrefix('Slideshow tips'), 'Slideshow tips');
  });
  it('handles nullish input', () => {
    assert.equal(stripSlidePrefix(null), '');
    assert.equal(stripSlidePrefix(undefined), '');
  });
});

describe('parseBullets', () => {
  it('splits strings on newlines', () => {
    assert.deepEqual(parseBullets('one\ntwo\nthree'), ['one', 'two', 'three']);
  });
  it('splits on semicolons', () => {
    assert.deepEqual(parseBullets('alpha; beta ;gamma'), ['alpha', 'beta', 'gamma']);
  });
  it('strips bullet markers and duplicate leading hyphens', () => {
    assert.deepEqual(parseBullets('• first\n- - second\n* third'), ['first', 'second', 'third']);
  });
  it('accepts arrays and drops empties', () => {
    assert.deepEqual(parseBullets(['  a  ', '', 'b\nc']), ['a', 'b', 'c']);
  });
  it('caps at max 6 by default', () => {
    assert.equal(parseBullets('1\n2\n3\n4\n5\n6\n7\n8').length, 6);
    assert.equal(parseBullets('1\n2\n3', 2).length, 2);
  });
});

describe('splitCardPoint', () => {
  it('splits on em dash, en dash, colon, period', () => {
    assert.deepEqual(splitCardPoint('Speed — Fast load times'), {
      heading: 'Speed',
      body: 'Fast load times',
    });
    assert.deepEqual(splitCardPoint('Speed – Fast load times'), {
      heading: 'Speed',
      body: 'Fast load times',
    });
    assert.deepEqual(splitCardPoint('Speed: Fast load times'), {
      heading: 'Speed',
      body: 'Fast load times',
    });
    assert.deepEqual(splitCardPoint('Speed. Fast load times'), {
      heading: 'Speed',
      body: 'Fast load times',
    });
  });
  it('rejects headings longer than 7 words', () => {
    const point = 'This heading has way too many words in it: body here';
    assert.deepEqual(splitCardPoint(point), { heading: null, body: point });
  });
  it('returns null heading when no separator', () => {
    assert.deepEqual(splitCardPoint('Just a plain line'), {
      heading: null,
      body: 'Just a plain line',
    });
  });
});

describe('splitCardPoints', () => {
  it('makes first 3 points cards and rest supporting lines', () => {
    const { cards, supporting } = splitCardPoints([
      'One: a',
      'Two: b',
      'Three: c',
      'credit line one',
      'credit line two',
    ]);
    assert.equal(cards.length, 3);
    assert.deepEqual(
      cards.map((c) => c.heading),
      ['One', 'Two', 'Three'],
    );
    assert.deepEqual(supporting, ['credit line one', 'credit line two']);
  });
});

describe('chooseLayout', () => {
  it('explicit layout wins over everything', () => {
    assert.equal(
      chooseLayout({ layout: 'custom', title: 'Appendix', content: 'x' }, 0, 5, {}),
      'custom',
    );
  });
  it('appendix beats chart, hero, cta, and cards', () => {
    const slide = {
      appendix: true,
      title: 'Appendix: detail',
      content: 'Revenue: 42\nCost: 7',
    };
    assert.equal(chooseLayout(slide, 0, 5, {}), 'appendix');
    assert.equal(
      chooseLayout({ title: 'Appendix notes', content: 'x' }, 1, 5, { appendix: true }),
      'appendix',
    );
  });
  it('metrics select chart before hero', () => {
    const slide = { title: 'Results', content: 'Revenue: 42\nCost: 7' };
    assert.equal(chooseLayout(slide, 0, 5, {}), 'chart');
    assert.equal(
      chooseLayout({ title: 'M', metrics: [{ label: 'A', value: 1 }] }, 2, 5, {}),
      'chart',
    );
  });
  it('index 0 without metrics is hero', () => {
    assert.equal(chooseLayout({ title: 'Intro', content: 'hello' }, 0, 5, {}), 'hero');
  });
  it('cta keywords beat cards', () => {
    const slide = {
      title: 'Next steps',
      content: 'One: a\nTwo: b\nThree: c',
    };
    assert.equal(chooseLayout(slide, 2, 5, {}), 'cta');
  });
  it('three structured points select cards, else standard', () => {
    const cards = { title: 'Points', content: 'One: a\nTwo: b\nThree: c' };
    assert.equal(chooseLayout(cards, 2, 5, {}), 'cards');
    const plain = { title: 'Notes', content: 'just one line' };
    assert.equal(chooseLayout(plain, 2, 5, {}), 'standard');
  });
});

describe('titleFontSize', () => {
  it('hero uses 40/34/30 by length', () => {
    assert.equal(titleFontSize('Short', 'hero'), 40);
    assert.equal(titleFontSize('x'.repeat(40), 'hero'), 34);
    assert.equal(titleFontSize('x'.repeat(80), 'hero'), 30);
  });
  it('normal layouts use 30/27/24 by length', () => {
    assert.equal(titleFontSize('Short', 'standard'), 30);
    assert.equal(titleFontSize('x'.repeat(40), 'cards'), 27);
    assert.equal(titleFontSize('x'.repeat(80), 'standard'), 24);
  });
});

describe('bodyFontSize', () => {
  it('defaults to 16 and shrinks when dense', () => {
    assert.equal(bodyFontSize(['short'], 'standard'), 16);
    assert.equal(bodyFontSize(['a', 'b', 'c', 'd'], 'standard'), 15);
    assert.equal(bodyFontSize(['a', 'b', 'c', 'd', 'e'], 'standard'), 14);
    assert.equal(bodyFontSize(['x'.repeat(500)], 'standard'), 14);
  });
});

describe('containRect', () => {
  it('fits wide images with vertical centering', () => {
    const r = containRect(1600, 900, { x: 0, y: 0, width: 13.333, height: 7.5 });
    assert.ok(Math.abs(r.width - 13.333) < 1e-9);
    assert.ok(Math.abs(r.height - 7.4998125) < 1e-9);
    assert.ok(Math.abs(r.x - 0) < 1e-9);
    assert.ok(Math.abs(r.y - (7.5 - r.height) / 2) < 1e-9);
  });
  it('fits tall images with horizontal centering', () => {
    const r = containRect(100, 200, { x: 1, y: 2, width: 10, height: 10 });
    assert.equal(r.width, 5);
    assert.equal(r.height, 10);
    assert.equal(r.x, 3.5);
    assert.equal(r.y, 2);
  });
  it('rejects non-positive dimensions', () => {
    assert.throws(() => containRect(0, 10, { width: 1, height: 1 }), RangeError);
  });
});

describe('parseMetrics', () => {
  it('accepts explicit slide.metrics', () => {
    assert.deepEqual(parseMetrics({ metrics: [{ label: 'A', value: '3' }] }), [
      { label: 'A', value: 3 },
    ]);
  });
  it('parses label:number bullets only when at least two exist', () => {
    assert.deepEqual(parseMetrics({ content: 'Revenue: 42\nCost: 7' }), [
      { label: 'Revenue', value: 42 },
      { label: 'Cost', value: 7 },
    ]);
    assert.equal(parseMetrics({ content: 'Revenue: 42\nJust a note' }), null);
    assert.equal(parseMetrics({ content: 'no numbers here' }), null);
  });
  it('never invents metrics', () => {
    assert.equal(parseMetrics({}), null);
    assert.equal(parseMetrics({ content: '' }), null);
  });
});
