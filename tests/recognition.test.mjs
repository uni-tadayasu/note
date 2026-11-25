import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeRecognitionPixels, rankRecognitionCandidates, recognizeImageCandidates } from '../dist/recognition.js';

function raster(width, height, rectangles) {
  const data = new Uint8ClampedArray(width * height * 4); data.fill(255);
  for (const [left, top, right, bottom] of rectangles) {
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 22;
    }
  }
  return { width, height, data };
}

test('a tall isolated glyph is normalized by ink height, not enlarged into a page', () => {
  const layout = analyzeRecognitionPixels(raster(500, 500, [[178, 160, 182, 330], [278, 160, 282, 330], [180, 248, 280, 252]]));
  assert.equal(layout.kind, 'compact');
  assert.equal(layout.height * layout.scale, 120);
  assert.ok(layout.scale < 1);
  assert.ok(layout.border >= 10);
});

test('a single text line and separate text lines retain distinct segmentation', () => {
  const line = analyzeRecognitionPixels(raster(600, 300, [[20, 30, 80, 100], [100, 30, 160, 100], [190, 30, 250, 100]]));
  assert.equal(line.kind, 'line');
  assert.equal(line.height * line.scale, 120);
  const block = analyzeRecognitionPixels(raster(600, 300, [[20, 30, 400, 100], [20, 150, 400, 220]]));
  assert.equal(block.kind, 'block');
  assert.equal(block.bands, 2);
  assert.throws(() => analyzeRecognitionPixels(raster(100, 100, [])), { code: 'EMPTY' });
});

test('a portrait three-line note stays a text block and is not shrunk to one glyph', () => {
  const portrait = analyzeRecognitionPixels(raster(300, 400, [[30, 30, 150, 90], [30, 130, 150, 190], [30, 230, 150, 290]]));
  assert.ok(portrait.aspect < 1);
  assert.equal(portrait.bands, 3);
  assert.equal(portrait.kind, 'block');
  assert.ok(portrait.height * portrait.scale > 120);
});

test('candidate ranking preserves confident Japanese and treats real dashes as valid text', () => {
  const compact = { kind: 'compact', aspect: 0.6 };
  assert.equal(rankRecognitionCandidates([{ text: '—', confidence: 62 }, { text: 'H', confidence: 93 }], compact, 'ja')[0].text, 'H');
  assert.equal(rankRecognitionCandidates([{ text: '日', confidence: 91 }, { text: 'O', confidence: 90 }], compact, 'ja')[0].text, '日');
  assert.equal(rankRecognitionCandidates([{ text: '日', confidence: 89 }, { text: 'O', confidence: 91 }], compact, 'ja')[0].text, '日');
  const dash = { kind: 'line', aspect: 20 };
  assert.equal(rankRecognitionCandidates([{ text: '—', confidence: 95 }, { text: 'I', confidence: 34 }], dash, 'ja')[0].text, '—');
});

function workerWith(results) {
  return {
    calls: [], languages: [],
    async setParameters(parameters) { this.mode = parameters.tessedit_pageseg_mode; },
    async recognize() { this.calls.push(this.mode); return { data: results.shift() }; },
    async reinitialize(language) { this.languages.push(language); },
  };
}

test('uncertain Japanese compact result gets at most three model passes and retains alternatives', async () => {
  const worker = workerWith([{ text: 'ー', confidence: 29 }, { text: '日', confidence: 66 }, { text: 'H', confidence: 93 }]);
  const result = await recognizeImageCandidates(worker, {}, { language: 'ja', layout: { kind: 'compact', aspect: 0.6 } });
  assert.equal(result.text, 'H');
  assert.equal(result.confidence, 93);
  assert.ok(result.alternatives.includes('日'));
  assert.deepEqual(worker.calls, ['8', '10', '8']);
  assert.deepEqual(worker.languages, ['eng+jpn']);
});

test('confident Japanese and English compact recognition do not trigger extra model loads', async () => {
  for (const [language, text] of [['ja', '川'], ['en', 'H']]) {
    const worker = workerWith([{ text, confidence: 94 }]);
    const result = await recognizeImageCandidates(worker, {}, { language, layout: { kind: 'compact', aspect: 0.8 } });
    assert.equal(result.text, text);
    assert.equal(worker.calls.length, 1);
    assert.equal(worker.languages.length, 0);
  }
});

test('a compact multi-letter word is not forced through single-character segmentation', async () => {
  const worker = workerWith([{ text: 'HI', confidence: 94 }]);
  const result = await recognizeImageCandidates(worker, {}, { language: 'en', layout: { kind: 'compact', aspect: 1.1 } });
  assert.equal(result.text, 'HI');
  assert.deepEqual(worker.calls, ['8']);
});

test('cancellation stops retries and language switching', async () => {
  const controller = new AbortController();
  const worker = workerWith([]);
  worker.recognize = async () => { worker.calls.push(worker.mode); controller.abort(); return { data: { text: 'ー', confidence: 20 } }; };
  await assert.rejects(recognizeImageCandidates(worker, {}, { language: 'ja', signal: controller.signal, layout: { kind: 'compact', aspect: 0.6 } }), { name: 'AbortError' });
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.languages.length, 0);
});
