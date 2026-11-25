/**
 * On-device handwriting recognition. Native stroke recognition is preferred
 * only where the browser reports support for the requested language. The
 * portable fallback is Tesseract OCR; its result must always be reviewed.
 * Recognition never uploads ink or text to a remote service.
 */
const ASSETS = new URL('./vendor/ocr/', import.meta.url);
let engine;
let enginePromise;
let engineLanguage;
let generation = 0;
let busy = false;
let reportProgress;
let idleTimer;

function failure(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function abortError() {
  return new DOMException('文字の認識を中止しました。', 'AbortError');
}

function checkAbort(signal) {
  if (signal?.aborted) throw abortError();
}

function bounded(promise, signal, milliseconds, timeoutMessage) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      handler(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timer = setTimeout(() => finish(reject, failure(timeoutMessage, 'TIMEOUT')), milliseconds);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

function progress(status, value) {
  reportProgress?.({ status, progress: Math.max(0, Math.min(1, value)) });
}

/** Release WASM memory when the conversion panel is closed or the app exits. */
export async function releaseRecognitionResources() {
  clearTimeout(idleTimer);
  generation += 1;
  const previous = engine;
  engine = undefined;
  enginePromise = undefined;
  engineLanguage = undefined;
  if (previous) await previous.terminate().catch(() => {});
}

async function nativeRecognition(strokes, language, signal) {
  if (!strokes?.length || typeof navigator.createHandwritingRecognizer !== 'function' ||
      typeof globalThis.HandwritingStroke !== 'function') return null;
  const locale = language?.startsWith('en') ? 'en' : 'ja';
  const query = navigator.queryHandwritingRecognizer || navigator.queryHandwritingRecognizerSupport;
  let recognizer;
  let drawing;
  try {
    if (query) {
      const support = await bounded(query.call(navigator, { languages: [locale] }), signal, 4000, '端末の文字認識を確認できませんでした。');
      if (!support) return null;
    }
    recognizer = await bounded(navigator.createHandwritingRecognizer({ languages: [locale] }), signal, 5000, '端末の文字認識を開始できませんでした。');
    checkAbort(signal);
    drawing = recognizer.startDrawing({ recognitionType: 'text', alternatives: 2 });
    for (const item of strokes) {
      const points = Array.isArray(item) ? item : item.points;
      if (!points?.length) continue;
      const stroke = new HandwritingStroke();
      let lastTime = 0;
      const firstTime = Number(points[0].t) || 0;
      for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        lastTime = Math.max(lastTime, (Number(point.t) || firstTime) - firstTime);
        stroke.addPoint({ x: point.x, y: point.y, t: lastTime });
      }
      drawing.addStroke(stroke);
    }
    progress('端末の手書き認識で変換しています…', 0.35);
    const predictions = await bounded(drawing.getPrediction(), signal, 8000, '端末の文字認識に時間がかかっています。');
    const text = predictions?.[0]?.text?.trim();
    if (!text) return null;
    return { text, confidence: null, method: 'native', alternatives: predictions.slice(1).map(item => item.text).filter(Boolean), warning: '認識結果を確認し、必要に応じて修正してください。' };
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // Support varies by language and operating system. OCR remains available.
    return null;
  } finally {
    try { drawing?.clear(); } catch { /* already released */ }
    try { recognizer?.finish(); } catch { /* already released */ }
  }
}

/** Crop dark ink, keep a white border, and normalize resolution for OCR. */
export function prepareRecognitionImage(source) {
  if (!source || !source.width || !source.height) throw failure('認識する手書き文字がありません。', 'EMPTY');
  const read = source.getContext('2d', { willReadFrequently: true });
  const { width, height } = source;
  const pixels = read.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3] / 255;
      const brightness = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) * alpha + 255 * (1 - alpha);
      if (brightness < 195) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < x0 || y1 < y0) throw failure('認識する文字が見つかりません。文字を少し大きめに書いてください。', 'EMPTY');
  const contentWidth = x1 - x0 + 1;
  const contentHeight = y1 - y0 + 1;
  const longest = Math.max(contentWidth, contentHeight);
  const scale = Math.min(3, 1800 / longest, Math.max(1, 900 / longest));
  const output = document.createElement('canvas');
  output.width = Math.round(contentWidth * scale) + 64;
  output.height = Math.round(contentHeight * scale) + 64;
  const context = output.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, x0, y0, contentWidth, contentHeight, 32, 32, output.width - 64, output.height - 64);
  return output;
}

async function getEngine(language, signal) {
  const languages = language?.startsWith('en') ? 'eng' : 'jpn+eng';
  if (engine && engineLanguage === languages) return engine;
  if (engine || enginePromise) await releaseRecognitionResources();
  const stamp = generation;
  // The pinned browser ESM build exposes the Tesseract API as its default
  // export (unlike the package's Node entry point, which has named exports).
  const runtime = await import('./vendor/ocr/tesseract.esm.min.js');
  const createWorker = runtime.default?.createWorker ?? runtime.createWorker;
  if (typeof createWorker !== 'function') throw failure('文字認識エンジンの読み込みに失敗しました。ページを再読み込みして、もう一度お試しください。', 'ENGINE_MODULE_ERROR');
  checkAbort(signal);
  progress('文字認識エンジンを読み込んでいます…', 0.06);
  enginePromise = createWorker(languages, 1, {
    workerPath: new URL('worker.min.js', ASSETS).href,
    corePath: new URL('core/', ASSETS).href,
    langPath: new URL('lang', ASSETS).href,
    workerBlobURL: false,
    legacyCore: false,
    legacyLang: false,
    cacheMethod: 'write',
    gzip: true,
    logger(message) {
      const value = Number(message.progress) || 0;
      if (message.status === 'recognizing text') progress('手書き文字を認識しています…', 0.4 + value * 0.58);
      else if (message.status === 'loading language traineddata') progress('日本語・英語の辞書を準備しています…', 0.15 + value * 0.18);
      else progress('文字認識エンジンを準備しています…', 0.08 + value * 0.08);
    },
  });
  // If a timeout or cancellation wins, terminate a subsequently loaded worker.
  enginePromise.then(worker => {
    if (stamp !== generation) worker.terminate().catch(() => {});
  }).catch(() => {});
  const worker = await bounded(enginePromise, signal, 90000, '文字認識の準備に時間がかかっています。通信を確認して、もう一度お試しください。');
  if (stamp !== generation) throw abortError();
  engine = worker;
  engineLanguage = languages;
  enginePromise = undefined;
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '0',
    user_defined_dpi: '300',
  });
  return worker;
}

/**
 * @param {{canvas: HTMLCanvasElement, strokes?: Array, language?: string,
 * onProgress?: Function, signal?: AbortSignal}} options
 * @returns {Promise<{text:string,confidence:number|null,method:string,warning:string}>}
 */
export async function recognizeHandwriting({ canvas, strokes = [], language = 'ja', onProgress, signal } = {}) {
  if (busy) throw failure('文字認識を実行中です。完了してからもう一度お試しください。', 'BUSY');
  checkAbort(signal);
  busy = true;
  clearTimeout(idleTimer);
  reportProgress = onProgress;
  let phase = 'native';
  try {
    progress('手書き文字を確認しています…', 0.02);
    const native = await nativeRecognition(strokes, language, signal);
    if (native) {
      progress('認識が完了しました', 1);
      return native;
    }
    checkAbort(signal);
    phase = 'image';
    const prepared = prepareRecognitionImage(canvas);
    phase = 'engine';
    const worker = await getEngine(language, signal);
    checkAbort(signal);
    phase = 'recognize';
    const result = await bounded(worker.recognize(prepared, {}, { text: true }), signal, 60000, '文字認識に時間がかかっています。短い文章に分けてお試しください。');
    checkAbort(signal);
    const text = (result.data?.text || '').replace(/\r\n?/g, '\n').trim();
    if (!text) throw failure('文字を読み取れませんでした。文字を大きめに、間隔を空けて書いてから再試行してください。', 'NO_TEXT');
    progress('認識が完了しました', 1);
    return {
      text,
      confidence: Number.isFinite(result.data.confidence) ? Math.round(result.data.confidence) : null,
      method: 'local-ocr',
      warning: '手書きの形や文字の間隔により誤認識する場合があります。結果を確認・修正してから挿入してください。',
    };
  } catch (error) {
    if (error.code !== 'EMPTY' && error.code !== 'NO_TEXT') await releaseRecognitionResources();
    if (error.name !== 'AbortError' && !['EMPTY', 'NO_TEXT'].includes(error.code)) {
      // Deliberately exclude ink, recognized text and image data from logs.
      console.error('[黒板 OCR] 文字認識を完了できませんでした。', {
        phase,
        name: typeof error.name === 'string' ? error.name.slice(0, 60) : 'Error',
        code: typeof error.code === 'string' ? error.code.slice(0, 60) : 'ENGINE_ERROR',
      });
    }
    if (error.name === 'AbortError' || error.code) throw error;
    const wrapped = failure('文字認識を準備できませんでした。通信を確認して再試行してください。手書きはそのまま保存されています。', 'ENGINE_ERROR');
    wrapped.cause = error;
    throw wrapped;
  } finally {
    busy = false;
    reportProgress = undefined;
    // Keep the worker warm for repeated conversions, then release its memory.
    idleTimer = setTimeout(() => { if (!busy) releaseRecognitionResources(); }, 120000);
  }
}
