/**
 * Browser speech with explicit pronunciation corrections.
 * Voices and pronunciation quality depend on the device's speech engine.
 * No text is sent to an application server by this module. A selected system
 * voice can itself be a network voice (SpeechSynthesisVoice.localService).
 */

const clamp = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
};
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Apply each correction once; explicit {display|reading} overrides the dictionary. */
export function applyPronunciations(text, dictionary = []) {
  const entries = new Map();
  const list = Array.isArray(dictionary)
    ? dictionary
    : Object.entries(dictionary || {}).map(([word, reading]) => ({ word, reading }));
  for (const entry of list) {
    if (!entry || entry.enabled === false) continue;
    const word = String(entry.word ?? entry.term ?? '').trim();
    const reading = String(entry.reading ?? entry.pronunciation ?? '').trim();
    if (word && reading) entries.set(word, reading);
  }
  const words = [...entries.keys()].sort((a, b) => b.length - a.length);
  // A single replacement pass avoids cascading e.g. 葛西 -> かさい -> 火災.
  const pattern = new RegExp('\\{([^{}|\\n]+)\\|([^{}|\\n]+)\\}' +
    (words.length ? '|' + words.map(escapeRegExp).join('|') : ''), 'gu');
  return String(text ?? '').replace(pattern, (match, display, reading) =>
    reading !== undefined ? reading : entries.get(match) ?? match);
}

/** Sentence chunks retain offsets into the ORIGINAL text for UI highlighting. */
export function splitSentences(text, maxLength = 140) {
  const source = String(text ?? '');
  const limit = Math.round(clamp(maxLength, 32, 400, 140));
  let segments;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    segments = [...new Intl.Segmenter('ja', { granularity: 'sentence' }).segment(source)]
      .map(({ segment, index }) => ({ text: segment, start: index }));
  } else {
    segments = [];
    const regex = /[^。！？!?\n]+(?:[。！？!?]+[」』）”"]*|\n|$)|[。！？!?]+/gu;
    for (const match of source.matchAll(regex)) segments.push({ text: match[0], start: match.index });
  }
  const result = [];
  const push = (raw, start) => {
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (value) result.push({ text: value, start: start + leading, end: start + leading + value.length });
  };
  for (const segment of segments) {
    // Paragraph breaks are natural pauses even when an engine's segmenter
    // treats several short paragraphs as one sentence.
    for (const match of segment.text.matchAll(/[^\r\n]+/gu)) {
      let remaining = match[0];
      let offset = segment.start + match.index;
      while (remaining.length > limit) {
        // Prefer a comma / space near the end over an arbitrary mid-word cut.
        const candidate = remaining.slice(0, limit + 1);
        let cut = -1;
        for (const boundary of candidate.matchAll(/[、，,；;：:、\s]/gu)) {
          if (boundary.index >= Math.floor(limit * .45)) cut = boundary.index + 1;
        }
        if (cut < 0) cut = limit;
        // Keep explicit pronunciation annotations intact when possible.
        const open = remaining.lastIndexOf('{', cut - 1);
        const close = remaining.indexOf('}', Math.max(0, open));
        if (open >= 0 && open < cut && close >= cut &&
            /^\{[^{}|\n]+\|[^{}|\n]+\}/u.test(remaining.slice(open))) {
          cut = open > 0 ? open : close + 1;
        }
        // Do not split a UTF-16 surrogate pair.
        const previous = remaining.charCodeAt(cut - 1);
        if (previous >= 0xd800 && previous <= 0xdbff) cut++;
        push(remaining.slice(0, cut), offset);
        offset += cut;
        remaining = remaining.slice(cut);
      }
      push(remaining, offset);
    }
  }
  return result;
}

const messages = {
  'not-supported': 'このブラウザは読み上げに対応していません。音声対応のブラウザで開いてください。',
  'empty-text': '読み上げるテキストがありません。文字を入力するか、手書きを文字に変換してください。',
  'not-allowed': '音声の再生が許可されませんでした。画面の再生ボタンをもう一度押してください。',
  'language-unavailable': '日本語の音声が見つかりません。端末の設定で日本語の読み上げ音声を追加し、もう一度開いてください。',
  'voice-unavailable': '選択した音声を利用できません。別の音声を選んでください。',
  'audio-busy': '音声出力を利用できません。他の音声再生を停止して、もう一度お試しください。',
  'audio-hardware': '音声出力を確認してください。端末の音量やスピーカー設定を確認して、もう一度お試しください。',
  'network': '読み上げ音声の取得に失敗しました。通信状態を確認するか、端末内の音声を選んでください。',
  'synthesis-unavailable': '読み上げ音声を利用できません。端末の日本語音声設定を確認してください。',
  'synthesis-failed': '読み上げを開始できませんでした。音声を選び直して、もう一度お試しください。',
  'start-timeout': '読み上げが開始されませんでした。端末に日本語音声があるか確認し、再生ボタンをもう一度押してください。',
  'interrupted': '読み上げが中断されました。再生ボタンからもう一度開始できます。',
  'canceled': '読み上げが中断されました。再生ボタンからもう一度開始できます。'
};

function detailEvent(name, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(name, { detail });
  const event = new Event(name);
  Object.defineProperty(event, 'detail', { value: detail });
  return event;
}

export class SpeechReader extends EventTarget {
  constructor() {
    super();
    this.synth = globalThis.speechSynthesis || null;
    this.state = 'idle';
    this.index = 0;
    this.sentences = [];
    this.options = {};
    this.utterance = null;
    this._generation = 0;
    this._startTimer = null;
    this._nextTimer = null;
    this._paused = false;
    this._nextPending = false;
    this._destroyed = false;
    this._voicesChanged = () => this.dispatchEvent(detailEvent('voiceschanged', this.getVoices()));
    this._pageHide = () => this.stop();
    this.synth?.addEventListener?.('voiceschanged', this._voicesChanged);
    globalThis.addEventListener?.('pagehide', this._pageHide);
  }

  get isSupported() {
    return !!this.synth && typeof globalThis.SpeechSynthesisUtterance === 'function' && !this._destroyed;
  }

  getVoices() {
    if (!this.isSupported) return [];
    const voices = this.synth.getVoices().slice();
    const score = voice => (/^ja(?:[-_]|$)/i.test(voice.lang) ? 100 : 0) +
      (voice.localService ? 10 : 0) + (voice.default ? 1 : 0);
    return voices.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'ja'));
  }

  /** Call directly from a click/tap handler; there is no awaited work before speak(). */
  speak(text, options = {}) {
    this._reset();
    this.options = { ...options };
    this.index = 0;
    this.sentences = splitSentences(text, 120);
    this._paused = false;
    this._nextPending = false;
    if (!this.isSupported) return this._fail('not-supported');
    if (!this.sentences.length) return this._fail('empty-text');
    const voices = this.getVoices();
    const requested = options.voiceURI ? voices.find(voice => voice.voiceURI === options.voiceURI) : null;
    if (options.voiceURI && voices.length && !requested) return this._fail('voice-unavailable');
    this._voice = requested || voices.find(voice => /^ja(?:[-_]|$)/i.test(voice.lang)) || null;
    // Empty voice lists can be temporary. Let the system resolve ja-JP in that case.
    if (!this._voice && voices.length && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(String(text))) {
      return this._fail('language-unavailable');
    }
    const generation = this._generation;
    this._setState('loading');
    if (generation !== this._generation) return false;
    this._speakCurrent(generation);
    return this.state !== 'error';
  }

  pause() {
    if (!this.isSupported || this._paused || !['speaking', 'loading'].includes(this.state)) return false;
    this._paused = true;
    clearTimeout(this._startTimer);
    this._startTimer = null;
    clearTimeout(this._nextTimer);
    this._nextTimer = null;
    if (!this.utterance) this._nextPending = true;
    this.synth.pause();
    this._setState('paused');
    return true;
  }

  resume() {
    if (!this.isSupported || !this._paused) return false;
    this._paused = false;
    const generation = this._generation;
    this.synth.resume();
    if (this._nextPending || !this.utterance) {
      this._nextPending = false;
      this._advance(generation);
    } else {
      this._setState(this.utterance._chalkStarted ? 'speaking' : 'loading');
      if (!this.utterance._chalkStarted) this._armStartTimer(generation, this.utterance);
    }
    return true;
  }

  stop() {
    this._reset();
    this._paused = false;
    this._nextPending = false;
    this._setState('idle');
  }

  destroy() {
    this.stop();
    this.synth?.removeEventListener?.('voiceschanged', this._voicesChanged);
    globalThis.removeEventListener?.('pagehide', this._pageHide);
    this._destroyed = true;
  }

  _reset() {
    // Invalidate every old event before cancel(), which can synchronously emit errors.
    this._generation++;
    clearTimeout(this._startTimer);
    clearTimeout(this._nextTimer);
    this._startTimer = null;
    this._nextTimer = null;
    this.utterance = null;
    this.synth?.cancel();
    // cancel() does not consistently clear the engine's paused flag.
    if (this.synth?.paused) this.synth.resume();
  }

  _notify(name, ...args) {
    try { this.options[name]?.(...args); }
    catch (error) { console.error('Speech UI callback failed:', error); }
  }

  _setState(state) {
    this.state = state;
    const detail = { state, index: this.index, total: this.sentences.length };
    this.dispatchEvent(detailEvent('statechange', detail));
    this._notify('onState', state, detail);
  }

  _fail(code, cause) {
    this._reset();
    this._paused = false;
    this._nextPending = false;
    const error = new Error(messages[code] || messages['synthesis-failed']);
    error.code = code;
    if (cause) error.cause = cause;
    this._setState('error');
    this.dispatchEvent(detailEvent('error', error));
    this._notify('onError', error);
    return false;
  }

  _armStartTimer(generation, utterance) {
    clearTimeout(this._startTimer);
    this._startTimer = setTimeout(() => {
      if (generation === this._generation && this.utterance === utterance && !this._paused && !utterance._chalkStarted) {
        this._fail('start-timeout');
      }
    }, 12000);
  }

  _speakCurrent(generation) {
    if (generation !== this._generation) return;
    if (this._paused) { this._nextPending = true; return; }
    const sentence = this.sentences[this.index];
    if (!sentence) { this._finish(generation); return; }
    const spoken = applyPronunciations(sentence.text, this.options.dictionary);
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = this._voice?.lang || 'ja-JP';
    if (this._voice) utterance.voice = this._voice;
    utterance.rate = clamp(this.options.rate ?? 1, .5, 2, 1);
    utterance.pitch = clamp(this.options.pitch ?? 1, .5, 2, 1);
    utterance.volume = clamp(this.options.volume ?? 1, 0, 1, 1);
    utterance._chalkStarted = false;
    this.utterance = utterance; // Retain until completion (some WebKit versions require it).
    const current = () => generation === this._generation && this.utterance === utterance;
    utterance.onstart = () => {
      if (!current()) return;
      utterance._chalkStarted = true;
      clearTimeout(this._startTimer);
      this._startTimer = null;
      this._setState(this._paused ? 'paused' : 'speaking');
      if (!current()) return;
      const detail = { ...sentence, spoken, index: this.index, total: this.sentences.length };
      this.dispatchEvent(detailEvent('sentence', detail));
      this._notify('onSentence', detail);
    };
    utterance.onend = () => {
      if (!current()) return;
      clearTimeout(this._startTimer);
      this._startTimer = null;
      this.utterance = null;
      this.index++;
      if (this._paused) { this._nextPending = true; return; }
      this._advance(generation);
    };
    utterance.onerror = event => {
      if (!current()) return;
      this._fail(event.error || 'synthesis-failed');
    };
    utterance.onpause = () => {
      if (current() && this._paused && this.state !== 'paused') this._setState('paused');
    };
    utterance.onresume = () => {
      if (current() && !this._paused && this.state !== 'speaking') this._setState('speaking');
    };
    this._armStartTimer(generation, utterance);
    try { this.synth.speak(utterance); }
    catch (cause) { if (current()) this._fail('synthesis-failed', cause); }
  }

  _advance(generation) {
    if (generation !== this._generation) return;
    if (this.index >= this.sentences.length) { this._finish(generation); return; }
    this._speakCurrent(generation);
  }

  _finish(generation) {
    if (generation !== this._generation) return;
    if (this.options.loop && this.sentences.length) {
      this.index = 0;
      this._nextTimer = setTimeout(() => {
        this._nextTimer = null;
        if (generation === this._generation) this._speakCurrent(generation);
      }, 350);
    } else {
      this.utterance = null;
      this._setState('ended');
    }
  }
}
