const FORMAT = 'kokuban-notes';
const VERSION = 1;
const LIMITS = Object.freeze({ notes: 1000, pagesPerNote: 500, totalPages: 10000, strokesPerPage: 5000, totalPoints: 500000, textsPerPage: 1000, totalTextCharacters: 5000000 });
const TEMPLATES = new Set(['dots', 'blank', 'grid', 'lines', 'cornell']);
const THEMES = new Set(['green', 'black', 'blue']);
const FONTS = new Set(['chalk', 'sans', 'serif']);
const STROKE_TOOLS = new Set(['pen', 'marker', 'line', 'rect', 'ellipse']);
const ACTIVE_TOOLS = new Set(['pen', 'marker', 'eraser', 'text', 'select', 'line', 'rect', 'ellipse']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function invalid(detail) {
  const error = new Error(`バックアップの形式が正しくありません。${detail}`);
  error.code = 'INVALID_BACKUP';
  return error;
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid(`${label}を確認してください。`);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (FORBIDDEN_KEYS.has(key) || descriptor.get || descriptor.set) throw invalid('安全に読み込めない項目が含まれています。');
  }
  return value;
}
function array(value, label, maximum, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw invalid(`${label}の件数が不正です。上限は${maximum.toLocaleString('ja-JP')}件です。`);
  for (let i = 0; i < value.length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || descriptor.get || descriptor.set) throw invalid(`${label}の項目が欠けています。`);
  }
  if (Object.keys(value).some(key => FORBIDDEN_KEYS.has(key))) throw invalid('安全に読み込めない項目が含まれています。');
  return value;
}
function string(value, label, maximum, minimum = 0) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum || /[\u0000\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw invalid(`${label}の文字数または内容を確認してください。`);
  return value;
}
function id(value, label, empty = false) {
  string(value, label, 128, empty ? 0 : 1);
  if (value && !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) throw invalid(`${label}に使用できない文字が含まれています。`);
  return value;
}
function number(value, label, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw invalid(`${label}が範囲外です。`);
  return value;
}
function boolean(value, label, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw invalid(`${label}を確認してください。`);
  return value;
}
function enumeration(value, choices, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!choices.has(value)) throw invalid(`${label}が対応していない形式です。`);
  return value;
}
function color(value, label) {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) throw invalid(`${label}を確認してください。`);
  return value;
}
function date(value, label) {
  const parts = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value) : null;
  if (!parts || !Number.isFinite(Date.parse(value))) throw invalid(`${label}が正しい日時ではありません。`);
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || hour > 23 || minute > 59 || second > 59) throw invalid(`${label}が正しい日時ではありません。`);
  return value;
}
function unique(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw invalid(`${label}の識別番号が重複しています。`);
    seen.add(item.id);
  }
  return items;
}
function budget() { return { pages: 0, points: 0, textCharacters: 0 }; }

function sanitizeStroke(value, totals, pageWidth, pageHeight) {
  const stroke = object(value, '手書き');
  const points = array(stroke.points, '手書きの点', LIMITS.totalPoints, 1);
  totals.points += points.length;
  if (totals.points > LIMITS.totalPoints) throw invalid('手書きデータは合計500,000点まで読み込めます。ノートを分けてください。');
  return {
    id: id(stroke.id, '手書きの識別番号'),
    tool: enumeration(stroke.tool, STROKE_TOOLS, '手書きの種類'),
    color: color(stroke.color, 'チョークの色'),
    size: number(stroke.size, 'チョークの太さ', 0.1, 320),
    pressure: boolean(stroke.pressure, '筆圧'),
    points: points.map(value => {
      const point = object(value, '手書きの点');
      return {
        x: number(point.x, '手書きの横位置', 0, pageWidth),
        y: number(point.y, '手書きの縦位置', 0, pageHeight),
        p: number(point.p === undefined ? 0.5 : point.p, '筆圧', 0, 1),
        t: number(point.t === undefined ? 0 : point.t, '手書きの時刻', 0, Number.MAX_SAFE_INTEGER),
      };
    }),
  };
}
function sanitizeText(value, totals, pageWidth, pageHeight) {
  const text = object(value, 'テキスト');
  const content = string(text.text, 'テキスト', 200000);
  const reading = own(text, 'reading') ? string(text.reading, '読み方', 200000) : undefined;
  totals.textCharacters += content.length + (reading?.length || 0);
  if (totals.textCharacters > LIMITS.totalTextCharacters) throw invalid('テキストは合計5,000,000文字まで読み込めます。');
  const output = {
    id: id(text.id, 'テキストの識別番号'),
    text: content,
    x: number(text.x, 'テキストの横位置', 0, pageWidth),
    y: number(text.y, 'テキストの縦位置', 0, pageHeight),
    width: number(text.width, 'テキストの幅', 1, pageWidth),
    size: number(text.size, '文字の大きさ', 1, 300),
    color: color(text.color, '文字の色'),
    font: enumeration(text.font, FONTS, '文字の書体', 'chalk'),
  };
  if (reading !== undefined) output.reading = reading;
  return output;
}
function sanitizePage(value, totals) {
  const page = object(value, 'ページ');
  totals.pages += 1;
  if (totals.pages > LIMITS.totalPages) throw invalid('ページは合計10,000ページまで読み込めます。');
  // Earlier backups used the fixed 1400×900 board. Missing dimensions retain
  // that coordinate system; adding viewport-sized pages never rescales old ink.
  const width = number(page.width === undefined ? 1400 : page.width, 'ページの幅', 64, 16384);
  const height = number(page.height === undefined ? 900 : page.height, 'ページの高さ', 64, 16384);
  return {
    id: id(page.id, 'ページの識別番号'),
    width,
    height,
    template: enumeration(page.template, TEMPLATES, 'ページの罫線', 'dots'),
    theme: enumeration(page.theme, THEMES, '黒板の色', 'green'),
    strokes: unique(array(page.strokes, 'ページ内の手書き', LIMITS.strokesPerPage).map(stroke => sanitizeStroke(stroke, totals, width, height)), '手書き'),
    texts: unique(array(page.texts, 'ページ内のテキスト', LIMITS.textsPerPage).map(text => sanitizeText(text, totals, width, height)), 'テキスト'),
  };
}
function sanitizeNote(value, totals = budget()) {
  const note = object(value, 'ノート');
  const pages = unique(array(note.pages, 'ノート内のページ', LIMITS.pagesPerNote, 1).map(page => sanitizePage(page, totals)), 'ページ');
  const pageIndex = number(note.pageIndex === undefined ? 0 : note.pageIndex, '表示中のページ', 0, pages.length - 1);
  if (!Number.isInteger(pageIndex)) throw invalid('表示中のページを確認してください。');
  return {
    id: id(note.id, 'ノートの識別番号'),
    title: string(note.title, 'ノート名', 120),
    folder: id(note.folder === undefined ? '' : note.folder, 'フォルダの識別番号', true),
    starred: boolean(note.starred, 'お気に入り'),
    deleted: boolean(note.deleted, 'ごみ箱'),
    created: date(note.created, '作成日時'),
    updated: date(note.updated, '更新日時'),
    pages,
    pageIndex,
  };
}
function sanitizeSettings(value) {
  const settings = object(value, '設定');
  const speech = settings.speech === undefined ? {} : object(settings.speech, '読み上げ設定');
  const boardLayoutVersion = number(settings.boardLayoutVersion === undefined ? 0 : settings.boardLayoutVersion, '黒板レイアウトのバージョン', 0, 10);
  if (!Number.isInteger(boardLayoutVersion)) throw invalid('黒板レイアウトのバージョンを確認してください。');
  return {
    folders: unique(array(settings.folders === undefined ? [] : settings.folders, 'フォルダ', 500).map(value => {
      const folder = object(value, 'フォルダ');
      return { id: id(folder.id, 'フォルダの識別番号'), name: string(folder.name, 'フォルダ名', 80, 1), color: color(folder.color, 'フォルダの色') };
    }), 'フォルダ'),
    dictionary: array(settings.dictionary === undefined ? [] : settings.dictionary, '読み方辞書', 5000).map(value => {
      const entry = object(value, '読み方辞書');
      return { word: string(entry.word, '辞書の単語', 200, 1), reading: string(entry.reading, '辞書の読み方', 300, 1) };
    }),
    speech: {
      voiceURI: string(speech.voiceURI === undefined ? '' : speech.voiceURI, '読み上げ音声', 1024),
      rate: number(speech.rate === undefined ? 1 : speech.rate, '読み上げ速度', 0.1, 10),
      pitch: number(speech.pitch === undefined ? 1 : speech.pitch, '声の高さ', 0, 2),
      volume: number(speech.volume === undefined ? 1 : speech.volume, '読み上げ音量', 0, 1),
      loop: boolean(speech.loop, '繰り返し再生'),
      allPages: boolean(speech.allPages, '連続再生'),
    },
    penOnly: boolean(settings.penOnly, 'ペン専用モード'),
    color: color(settings.color === undefined ? '#f4f2df' : settings.color, '選択中のチョークの色'),
    size: number(settings.size === undefined ? 4 : settings.size, '選択中のチョークの太さ', 1, 24),
    tool: enumeration(settings.tool, ACTIVE_TOOLS, '選択中の道具', 'pen'),
    theme: enumeration(settings.theme, THEMES, '黒板の既定の色', 'green'),
    template: enumeration(settings.template, TEMPLATES, 'ページの既定の罫線', 'dots'),
    lastNoteId: id(settings.lastNoteId === undefined ? '' : settings.lastNoteId, '前回開いたノートの識別番号', true),
    boardLayoutVersion,
  };
}

/** Validate imported JSON without interpreting text or retaining unknown fields. */
export function validateBackup(payload) {
  object(payload, 'バックアップ');
  if (payload.format !== FORMAT || payload.version !== VERSION) throw invalid('「黒板」のバージョン1のバックアップを選んでください。');
  const totals = budget();
  const notes = unique(array(payload.notes, 'ノート', LIMITS.notes).map(note => sanitizeNote(note, totals)), 'ノート');
  return { notes, settings: sanitizeSettings(payload.settings) };
}

/** Returns a complete JSON-safe snapshot; caller chooses the download filename. */
export function backupPayload(notes, settings) {
  const clean = validateBackup({ format: FORMAT, version: VERSION, notes, settings });
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), ...clean };
}

function storageError(cause, operation = '保存') {
  const name = cause?.name;
  let message = `ノートを${operation}できませんでした。ページを閉じずに、再試行してください。`;
  if (name === 'QuotaExceededError') message = '端末の保存容量が不足しています。バックアップを保存してから、不要なデータを整理してください。';
  else if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotSupportedError') message = 'このブラウザではノートの保存領域を利用できません。ブラウザの保存設定を確認してください。';
  const error = new Error(message, { cause });
  error.code = name === 'QuotaExceededError' ? 'STORAGE_FULL' : 'STORAGE_ERROR';
  return error;
}

/** Durable browser-local storage. Successful writes resolve at transaction completion. */
export class NoteStore {
  constructor(name = 'kokuban-notes') {
    this.name = name;
    this.db = null;
    this.opening = null;
  }
  async open() {
    if (this.db) return this;
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      let request;
      let settled = false;
      const fail = error => { if (!settled) { settled = true; reject(error); } };
      try {
        if (!globalThis.indexedDB) throw new DOMException('IndexedDB unavailable', 'NotSupportedError');
        request = globalThis.indexedDB.open(this.name, 1);
      } catch (error) { fail(storageError(error, '読み込み')); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onerror = () => fail(storageError(request.error, '読み込み'));
      request.onblocked = () => {
        const error = new Error('別のタブで黒板を開いています。そのタブを閉じてから、もう一度お試しください。');
        error.code = 'STORAGE_BLOCKED';
        fail(error);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        this.db = db;
        db.onversionchange = () => { db.close(); if (this.db === db) this.db = null; this.opening = null; };
        db.onclose = () => { if (this.db === db) this.db = null; this.opening = null; };
        resolve(this);
      };
    });
    try { return await this.opening; }
    catch (error) { this.opening = null; throw error; }
  }
  async _transaction(storeName, mode, action) {
    await this.open();
    return new Promise((resolve, reject) => {
      let transaction;
      let request;
      let requestError;
      try {
        transaction = this.db.transaction(storeName, mode);
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onabort = () => reject(storageError(transaction.error || requestError, mode === 'readonly' ? '読み込み' : '保存'));
        transaction.onerror = () => { requestError = transaction.error || request?.error; };
        request = action(transaction.objectStore(storeName));
        request.onerror = () => { requestError = request.error; };
      } catch (error) {
        try { transaction?.abort(); } catch { /* already finished */ }
        reject(storageError(error, mode === 'readonly' ? '読み込み' : '保存'));
      }
    });
  }
  async listNotes() {
    const notes = await this._transaction('notes', 'readonly', store => store.getAll());
    return (notes || []).sort((a, b) => b.updated.localeCompare(a.updated));
  }
  async saveNote(note) {
    // Snapshot synchronously before opening a transaction; later UI edits cannot
    // mutate an in-flight save or be mistaken for committed data.
    const snapshot = sanitizeNote(note);
    await this._transaction('notes', 'readwrite', store => store.put(snapshot));
    return snapshot;
  }
  async deleteNote(noteId) {
    const key = id(noteId, 'ノートの識別番号');
    await this._transaction('notes', 'readwrite', store => store.delete(key));
  }
  async getSettings() {
    const record = await this._transaction('meta', 'readonly', store => store.get('settings'));
    return record?.value ?? null;
  }
  async saveSettings(settings) {
    const snapshot = sanitizeSettings(settings);
    await this._transaction('meta', 'readwrite', store => store.put({ key: 'settings', value: snapshot }));
    return snapshot;
  }
}
