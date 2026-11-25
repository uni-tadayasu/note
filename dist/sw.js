/* Offline shell and optional on-device OCR assets. Paths remain within this app's scope. */
const CACHE_VERSION = 'kokuban-v2-20261125';
const SCOPE = new URL(self.registration.scope);
const SCOPE_ID = encodeURIComponent(SCOPE.pathname);
const CORE_CACHE = `${CACHE_VERSION}-core-${SCOPE_ID}`;
const OCR_CACHE = `${CACHE_VERSION}-ocr-${SCOPE_ID}`;
const CORE_FILES = [
  'index.html', 'styles.css', 'app.js', 'ink.js', 'speech.js', 'storage.js',
  'sample-data.js', 'recognition.js', 'manifest.webmanifest', 'assets/icon.svg',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png',
  'assets/Yomogi-Regular.ttf',
];
const CORE_URLS = new Set(CORE_FILES.map(path => new URL(path, SCOPE).href));
const CORE_VARIANTS = ['lstm', 'simd-lstm', 'relaxedsimd-lstm'];
const OCR_REQUIRED = [
  'tesseract.esm.min.js', 'worker.min.js', 'lang/eng.traineddata.gz', 'lang/jpn.traineddata.gz',
  ...CORE_VARIANTS.flatMap(variant => ['.js', '.wasm', '.wasm.js'].map(extension => `core/tesseract-core-${variant}${extension}`)),
].map(path => `vendor/ocr/${path}`);
const OCR_ALLOWED = new Set([
  ...OCR_REQUIRED,
  'vendor/ocr/worker.min.js.LICENSE.txt', 'vendor/ocr/tesseract.min.js.LICENSE.txt',
  'vendor/ocr/TESSERACT-JS-LICENSE.md', 'vendor/ocr/TESSERACT-CORE-LICENSE',
  'vendor/ocr/THIRD_PARTY.txt', 'vendor/ocr/asset-list.json',
]);
const OCR_MANIFEST = new URL('vendor/ocr/asset-list.json', SCOPE).href;
let preparation;
let progress = { progress: 0, total: 0 };
const listeners = new Set();

function canonical(url) {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}
function withinScope(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
}
function ocrPath(url) {
  if (!withinScope(url)) return null;
  const path = url.pathname.slice(SCOPE.pathname.length);
  return OCR_ALLOWED.has(path) ? path : null;
}
async function network(request, milliseconds = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await fetch(request, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok || response.type === 'opaque') throw new Error(`HTTP ${response.status}`);
    if (response.url && !withinScope(new URL(response.url))) throw new Error('Unexpected redirect');
    return response;
  } finally { clearTimeout(timer); }
}

self.addEventListener('install', event => {
  // addAll commits a complete release shell. OCR's larger payload is opt-in.
  event.waitUntil(caches.open(CORE_CACHE).then(cache => cache.addAll(
    CORE_FILES.map(path => new Request(new URL(path, SCOPE), { cache: 'reload' })),
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name =>
      name.startsWith('kokuban-v') && name.endsWith(`-${SCOPE_ID}`) &&
      name !== CORE_CACHE && name !== OCR_CACHE,
    ).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function coreResponse(request, key) {
  try { return await network(request, 6000); }
  catch {
    const cache = await caches.open(CORE_CACHE);
    const cached = await cache.match(key);
    if (cached) return cached;
    return new Response('黒板を開けませんでした。通信を確認して、もう一度お試しください。', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  // The installed shell is intentionally immutable: individually refreshing it
  // could leave mixed versions after an interrupted update. A changed release
  // version installs the next complete snapshot before it claims clients.
}

async function boundedOCRResponse(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(request, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok || response.type === 'opaque') throw new Error(`HTTP ${response.status}`);
    if (response.url && !withinScope(new URL(response.url))) throw new Error('Unexpected redirect');
    const declared = Number(response.headers.get('Content-Length') || 0);
    if (declared > 8 * 1024 * 1024) throw new Error('Recognition asset exceeds size limit');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Recognition asset exceeds size limit');
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { clearTimeout(timer); }
}
async function ocrResponse(request, key) {
  const cache = await caches.open(OCR_CACHE);
  const cached = await cache.match(key);
  if (cached) return cached;
  try {
    const response = await boundedOCRResponse(request);
    // Recognition can still work online if device storage is full.
    await cache.put(key, response.clone()).catch(() => {});
    return response;
  } catch {
    return new Response('文字認識用データを読み込めませんでした。通信を確認してください。', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = canonical(request.url);
  if (!withinScope(url)) return;
  const home = url.pathname === SCOPE.pathname || url.href === new URL('index.html', SCOPE).href;
  if (home || CORE_URLS.has(url.href)) {
    const key = home ? new URL('index.html', SCOPE).href : url.href;
    event.respondWith(coreResponse(request, key));
  } else if (ocrPath(url)) {
    event.respondWith(ocrResponse(request, url.href));
  }
});

function broadcast(value) {
  for (const port of listeners) {
    try { port.postMessage(value); }
    catch { listeners.delete(port); }
  }
}
function validatedAssetList(data) {
  if (!Array.isArray(data) || !data.length || data.length > OCR_ALLOWED.size) throw new Error('文字認識用データの一覧を読み込めませんでした。');
  const list = [];
  const seen = new Set();
  for (const path of data) {
    if (typeof path !== 'string' || !OCR_ALLOWED.has(path) || path === 'vendor/ocr/asset-list.json' || seen.has(path)) throw new Error('文字認識用データの一覧に不正な項目があります。');
    const url = new URL(path, SCOPE);
    if (!withinScope(url) || ocrPath(url) !== path || url.search || url.hash) throw new Error('文字認識用データの保存先が正しくありません。');
    seen.add(path);
    list.push(url.href);
  }
  if (OCR_REQUIRED.some(path => !seen.has(path))) throw new Error('文字認識用データの一覧が不完全です。ページを再読み込みしてください。');
  return list;
}

async function prepareOCR() {
  const cache = await caches.open(OCR_CACHE);
  let manifest;
  try { manifest = await network(OCR_MANIFEST); }
  catch { manifest = await cache.match(OCR_MANIFEST); }
  if (!manifest) throw new Error('文字認識用データを準備できません。通信を確認して、もう一度お試しください。');
  const manifestText = await manifest.clone().text();
  if (manifestText.length > 16000) throw new Error('文字認識用データの一覧を読み込めませんでした。');
  let data;
  try { data = JSON.parse(manifestText); }
  catch { throw new Error('文字認識用データの一覧を読み込めませんでした。'); }
  const urls = validatedAssetList(data);
  await cache.put(OCR_MANIFEST, manifest);
  progress = { progress: 0, total: urls.length };
  broadcast(progress);
  let next = 0;
  let downloadFailure;
  // Two concurrent downloads keep mobile memory use bounded. A closed dialog
  // does not cancel an intentionally requested offline preparation.
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (!downloadFailure && next < urls.length) {
      const url = urls[next++];
      try {
        if (!await cache.match(url)) {
          const response = await boundedOCRResponse(url);
          await cache.put(url, response);
        }
        progress = { progress: progress.progress + 1, total: urls.length };
        broadcast(progress);
      } catch (error) {
        downloadFailure = error;
      }
    }
  }));
  if (downloadFailure) throw downloadFailure;
}

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_OCR' || !event.ports?.[0]) return;
  const port = event.ports[0];
  try {
    if (!event.source?.url || !withinScope(new URL(event.source.url))) return;
  } catch { return; }
  listeners.add(port);
  try { port.postMessage(progress); } catch { listeners.delete(port); }
  if (!preparation) {
    preparation = prepareOCR().then(() => broadcast({ done: true })).catch(error => {
      broadcast({ error: error?.name === 'QuotaExceededError'
        ? '端末の保存容量が不足しています。空き容量を確認して再試行してください。'
        : /^[\u3000-\u9fff]/u.test(error?.message || '') ? error.message
          : '文字認識用データを保存できませんでした。通信と空き容量を確認して再試行してください。' });
    }).finally(() => {
      for (const activePort of listeners) { try { activePort.close(); } catch { /* already closed */ } }
      listeners.clear();
      progress = { progress: 0, total: 0 };
      preparation = null;
    });
  }
  event.waitUntil(preparation);
});
