import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoteStore, validateBackup, backupPayload } from '../dist/storage.js';

const note = () => ({
  id: 'note-1', title: 'わたしの黒板', folder: 'ideas', starred: true, deleted: false,
  created: '2026-11-25T09:00:00.000Z', updated: '2026-11-25T10:00:00.000Z', pageIndex: 0,
  pages: [{ id: 'page-1', template: 'cornell', theme: 'green',
    strokes: [{ id: 'stroke-1', tool: 'pen', color: '#f4f2df', size: 4.25, pressure: true, points: [{ x: 0, y: 900, p: 0.05, t: 0 }, { x: 1400, y: 0, p: 1, t: 48.125 }] }],
    texts: [{ id: 'text-1', text: '葛西寿史のノート。\n<script>これは文章</script> 😀', reading: 'かさいただやすのノート。', x: 100, y: 120, width: 650, size: 38, color: '#ffcc77', font: 'chalk' }],
  }],
});
const settings = () => ({
  folders: [{ id: 'ideas', name: 'アイデア', color: '#f5c979' }],
  dictionary: [{ word: '葛西', reading: 'かさい' }],
  speech: { voiceURI: 'ja-JP-local', rate: 0.9, pitch: 1, volume: 0.7, loop: false, allPages: true }, penOnly: true,
  color: '#a4c5d8', size: 12, tool: 'select', theme: 'blue', template: 'cornell', lastNoteId: 'note-1',
});
const payload = () => ({ format: 'kokuban-notes', version: 1, notes: [note()], settings: settings() });

test('backup preserves every known field, fractional ink, ruby override and plain text', () => {
  const original = payload();
  const result = validateBackup(JSON.parse(JSON.stringify(backupPayload(original.notes, original.settings))));
  assert.deepEqual(result, { notes: original.notes, settings: original.settings });
  original.notes[0].pages[0].strokes[0].points[0].x = 99;
  assert.equal(result.notes[0].pages[0].strokes[0].points[0].x, 0);
  assert.ok(result.notes[0].pages[0].texts[0].text.includes('<script>'));
});

test('unknown data is discarded and prototype/accessor attacks are rejected', () => {
  const data = payload();
  data.privateRuntimeState = { endpoint: 'discard' };
  data.notes[0].arbitrary = 'discard';
  data.notes[0].pages[0].strokes[0].points[0].random = 'discard';
  const result = validateBackup(data);
  assert.equal(result.privateRuntimeState, undefined);
  assert.equal(result.notes[0].arbitrary, undefined);
  assert.equal(result.notes[0].pages[0].strokes[0].points[0].random, undefined);
  const polluted = JSON.parse(JSON.stringify(payload()).replace('"title":"わたしの黒板"', '"__proto__":{"polluted":true},"title":"わたしの黒板"'));
  assert.throws(() => validateBackup(polluted), { code: 'INVALID_BACKUP' });
  assert.equal({}.polluted, undefined);
  const accessor = payload();
  Object.defineProperty(accessor.notes[0], 'title', { enumerable: true, get() { throw new Error('Must never execute'); } });
  assert.throws(() => validateBackup(accessor), { code: 'INVALID_BACKUP' });
});

test('selected note and drawing preferences survive backup and receive valid defaults', () => {
  const data = payload();
  const restored = validateBackup(backupPayload(data.notes, data.settings)).settings;
  for (const key of ['color', 'size', 'tool', 'theme', 'template', 'lastNoteId']) assert.equal(restored[key], data.settings[key]);
  const minimal = payload(); minimal.settings = {};
  const defaults = validateBackup(minimal).settings;
  assert.equal(defaults.color, '#f4f2df');
  assert.equal(defaults.size, 4);
  assert.equal(defaults.tool, 'pen');
  assert.equal(defaults.theme, 'green');
  assert.equal(defaults.template, 'dots');
  assert.equal(defaults.lastNoteId, '');
  for (const tool of ['pen', 'marker', 'eraser', 'text', 'select', 'line', 'rect', 'ellipse']) {
    const example = payload(); example.settings.tool = tool;
    assert.equal(validateBackup(example).settings.tool, tool);
  }
  for (const [key, value] of [['size', 0], ['size', 25], ['tool', 'unknown'], ['lastNoteId', 'bad id']]) {
    const example = payload(); example.settings[key] = value;
    assert.throws(() => validateBackup(example), { code: 'INVALID_BACKUP' });
  }
});

test('invalid geometry, schemas, enums and duplicate identifiers are rejected', () => {
  const cases = [
    p => { p.version = 2; },
    p => { p.notes[0].pages[0].strokes[0].points[0].x = 1401; },
    p => { p.notes[0].pages[0].strokes[0].points[0].y = -1; },
    p => { p.notes[0].pages[0].strokes[0].points[0].p = NaN; },
    p => { p.notes[0].pages[0].texts[0].width = Infinity; },
    p => { p.notes[0].pages[0].theme = 'url(unsafe)'; },
    p => { p.notes[0].pages[0].texts[0].font = 'unknown'; },
    p => { p.notes[0].pageIndex = 1; },
    p => { p.notes[0].created = 'yesterday'; },
    p => { p.notes[0].created = '2026-02-30T09:00:00.000Z'; },
    p => { p.notes[0].deleted = 'false'; },
    p => { p.notes.push(structuredClone(p.notes[0])); },
    p => { p.notes[0].pages = []; },
    p => { p.notes[0].pages[0].texts = new Array(1); },
    p => { p.settings.dictionary[0].reading = ''; },
  ];
  for (const mutate of cases) {
    const data = payload(); mutate(data);
    assert.throws(() => validateBackup(data), { code: 'INVALID_BACKUP' });
  }
});

test('global point cap is enforced across multiple pages', () => {
  const data = payload();
  const point = { x: 10, y: 10, p: 0.5, t: 0 };
  data.notes[0].pages[0].strokes[0].points = Array(250001).fill(point);
  const second = structuredClone(data.notes[0].pages[0]);
  second.id = 'page-2';
  data.notes[0].pages.push(second);
  assert.throws(() => validateBackup(data), { code: 'INVALID_BACKUP' });
});

// Controlled IndexedDB transport: explicitly deliver request success before
// transaction completion to test the persistence boundary, then force abort.
function controlledDatabase() {
  const pending = [];
  const records = { notes: new Map(), meta: new Map() };
  const db = {
    transaction(name) {
      const tx = { error: null, abort() { queueMicrotask(() => tx.onabort?.()); }, objectStore() {
        return {
          put(value) { return add('put', value); },
          delete(key) { return add('delete', key); },
          get(key) { return add('get', key); },
          getAll() { return add('all'); },
        };
      } };
      function add(type, value) {
        const request = { result: undefined, error: null };
        pending.push({ tx, request, name, type, value: structuredClone(value) });
        return request;
      }
      return tx;
    },
  };
  function success(item) {
    const { type, value, name, request } = item;
    if (type === 'get') request.result = structuredClone(records[name].get(value));
    if (type === 'all') request.result = structuredClone([...records[name].values()]);
    if (type === 'put') request.result = value.id || value.key;
    request.onsuccess?.();
  }
  function commit(item) {
    if (item.type === 'put') records[item.name].set(item.value.id || item.value.key, structuredClone(item.value));
    if (item.type === 'delete') records[item.name].delete(item.value);
    item.tx.oncomplete?.();
  }
  return { db, pending, records, success, commit };
}

test('save resolves only after transaction commit and uses a stable snapshot', async () => {
  const fake = controlledDatabase();
  const store = new NoteStore(); store.db = fake.db;
  const source = note();
  let resolved = false;
  const saved = store.saveNote(source).then(value => { resolved = true; return value; });
  source.title = '後から編集';
  source.pages[0].strokes[0].points[0].x = 99;
  await Promise.resolve();
  const item = fake.pending.shift();
  fake.success(item);
  await Promise.resolve();
  assert.equal(resolved, false, 'request success is not a committed save');
  fake.commit(item);
  const result = await saved;
  assert.equal(result.title, 'わたしの黒板');
  assert.equal(result.pages[0].strokes[0].points[0].x, 0);
  assert.deepEqual(fake.records.notes.get('note-1'), result);
});

test('aborted and quota-exceeded transactions reject without discarding old notes', async () => {
  const fake = controlledDatabase();
  fake.records.notes.set('note-1', note());
  const store = new NoteStore(); store.db = fake.db;
  const updated = note(); updated.title = '容量不足で失敗する更新';
  const saved = store.saveNote(updated);
  const rejection = assert.rejects(saved, error => error.code === 'STORAGE_FULL' && /容量/.test(error.message));
  await Promise.resolve();
  const item = fake.pending.shift();
  fake.success(item);
  item.tx.error = new DOMException('Quota', 'QuotaExceededError');
  item.tx.onabort();
  await rejection;
  assert.equal(fake.records.notes.get('note-1').title, 'わたしの黒板');
});

test('settings are null initially, save on commit, and deletion is committed explicitly', async () => {
  const fake = controlledDatabase();
  const store = new NoteStore(); store.db = fake.db;
  let operation = store.getSettings(); await Promise.resolve();
  let item = fake.pending.shift(); fake.success(item); fake.commit(item);
  assert.equal(await operation, null);
  operation = store.saveSettings(settings()); await Promise.resolve();
  item = fake.pending.shift(); fake.success(item); fake.commit(item);
  assert.deepEqual(await operation, settings());
  operation = store.getSettings(); await Promise.resolve();
  item = fake.pending.shift(); fake.success(item); fake.commit(item);
  assert.deepEqual(await operation, settings());
  fake.records.notes.set('note-1', note());
  operation = store.deleteNote('note-1'); await Promise.resolve();
  item = fake.pending.shift(); fake.success(item);
  assert.equal(fake.records.notes.has('note-1'), true);
  fake.commit(item); await operation;
  assert.equal(fake.records.notes.has('note-1'), false);
});

test('unavailable IndexedDB is an explicit failure with no localStorage fallback', async () => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  try { await assert.rejects(new NoteStore().open(), error => error.code === 'STORAGE_ERROR' && /保存領域/.test(error.message)); }
  finally { globalThis.indexedDB = original; }
});
