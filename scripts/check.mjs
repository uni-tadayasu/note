import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dependency-free deployment checks for the actual static artifact. These do
// not start a browser, mutate source, or download anything.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
const canonical = 'https://uni-tadayasu.github.io/note/';
const failures = [];
const checked = new Set();
const fail = message => failures.push(message);
const assert = (condition, message) => { if (!condition) fail(message); };
const relative = file => path.relative(project, file).replaceAll(path.sep, '/');
const fileSize = async file => {
  try { const info = await stat(file); return info.isFile() ? info.size : -1; }
  catch { return -1; }
};

async function requireAsset(reference, from = path.join(dist, 'index.html'), context = 'asset') {
  if (!reference || reference.includes('${') || /^(?:data:|blob:|mailto:|tel:|#)/i.test(reference)) return;
  if (/^(?:https?:)?\/\//i.test(reference)) return;
  if (reference.startsWith('/') || reference.includes('\\')) {
    fail(`${relative(from)}: ${context} must be relative for /note/ hosting: ${reference}`);
    return;
  }
  let clean;
  try { clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]); }
  catch { fail(`${relative(from)}: invalid URL ${reference}`); return; }
  if (!clean) return;
  let target = path.resolve(path.dirname(from), clean);
  if (target !== dist && !target.startsWith(dist + path.sep)) {
    fail(`${relative(from)}: asset escapes dist/: ${reference}`);
    return;
  }
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      // Directory URLs used as OCR bases are valid. Page links need index.html.
      if (context === 'navigation') target = path.join(target, 'index.html');
      else { checked.add(relative(target) + '/'); return; }
    }
    assert((await fileSize(target)) > 0, `${relative(from)}: empty or non-file ${reference}`);
    checked.add(relative(target));
  } catch { fail(`${relative(from)}: missing ${context} ${reference}`); }
}

function attributes(tag) {
  const output = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) output[match[1].toLowerCase()] = match[3];
  return output;
}

const required = ['index.html', 'styles.css', 'app.js', 'ink.js', 'speech.js', 'storage.js',
  'sample-data.js', 'recognition.js', 'sw.js', 'manifest.webmanifest', 'assets/icon.svg',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png', 'assets/ogp.png',
  'assets/Yomogi-Regular.ttf', 'assets/Yomogi-OFL.txt', 'vendor/ocr/asset-list.json'];
for (const asset of required) await requireAsset(asset);

const appFiles = (await readdir(dist)).filter(name => /\.(?:js|css|html)$/.test(name));
for (const name of appFiles) {
  const file = path.join(dist, name);
  const source = await readFile(file, 'utf8');
  if (name.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) fail(`${relative(file)}: syntax check failed\n${result.stderr || result.error || ''}`);
    const moduleReferences = [
      ...source.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
      ...source.matchAll(/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g),
    ];
    for (const match of moduleReferences) {
      if (!/^(?:\.{1,2}\/|\/|https?:)/.test(match[1])) fail(`${relative(file)}: unresolved bare browser import ${match[1]}`);
      else await requireAsset(match[1], file, 'module / URL');
    }
    // Capture literal app-resource paths, including service-worker precache lists.
    for (const match of source.matchAll(/["']((?:\.{1,2}\/|\/)[^"'\n]+?\.(?:html|js|css|json|webmanifest|png|svg|ttf|woff2?|wasm|gz|txt))["']/g)) {
      await requireAsset(match[1], file, 'resource');
    }
    // Dynamic template values are skipped; fixed image sources must resolve.
    for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) await requireAsset(match[1], file, 'markup resource');
  }
  if (name.endsWith('.css')) {
    for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
      await requireAsset((match[1] ?? match[2] ?? match[3]).trim(), file, 'CSS URL');
    }
  }
  if (name.endsWith('.html')) {
    for (const match of source.matchAll(/<(?:script|img|link|source|audio|video|a)\b[^>]*>/gi)) {
      const attr = attributes(match[0]);
      if (attr.src) await requireAsset(attr.src, file, 'src');
      if (attr.href) await requireAsset(attr.href, file, /^<a\b/i.test(match[0]) ? 'navigation' : 'href');
    }
  }
}

const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const meta = new Map([...html.matchAll(/<meta\b[^>]*>/gi)].map(match => {
  const attr = attributes(match[0]); return [attr.name || attr.property, attr.content];
}));
const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
const title = /<title>([^<]+)<\/title>/i.exec(html)?.[1];
assert(/^黒板(?:\s|\||｜|—|$)/u.test(title || ''), 'Page title must use the exact app name 黒板.');
assert(meta.get('og:site_name') === '黒板', 'og:site_name must be 黒板.');
assert(meta.get('apple-mobile-web-app-title') === '黒板', 'Apple home-screen name must be 黒板.');
assert(links.find(link => link.rel === 'canonical')?.href === canonical, `Canonical URL must be ${canonical}`);
assert(meta.get('og:url') === canonical, `og:url must be ${canonical}`);
assert(meta.get('og:image') === canonical + 'assets/ogp.png', 'og:image must reference the deployed OGP PNG.');
assert(meta.get('twitter:image') === canonical + 'assets/ogp.png', 'twitter:image must reference the deployed OGP PNG.');
assert(meta.get('twitter:card') === 'summary_large_image', 'Twitter card must use the large image.');
assert(links.some(link => link.rel === 'icon'), 'Missing favicon link.');
assert(links.some(link => link.rel === 'apple-touch-icon'), 'Missing Apple touch icon link.');
assert(links.some(link => link.rel === 'manifest'), 'Missing app manifest link.');
assert(/<html\b[^>]*\blang=["']ja["']/i.test(html), 'The document language must be Japanese.');
assert((meta.get('description') || '').trim().length > 20, 'Missing useful description metadata.');

try {
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  assert(manifest.short_name === '黒板' && /^黒板(?:\s|—|$)/u.test(manifest.name || ''), 'Manifest names must use 黒板.');
  assert(manifest.lang === 'ja', 'Manifest lang must be ja.');
  assert(manifest.start_url === './' && manifest.scope === './' && manifest.id === './', 'Manifest must preserve the relative /note/ app scope.');
  assert(['standalone', 'fullscreen'].includes(manifest.display), 'Manifest display must use an app mode: fullscreen or standalone.');
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest needs app icons.');
  for (const icon of manifest.icons || []) await requireAsset(icon.src, path.join(dist, 'manifest.webmanifest'), 'manifest icon');
  assert(manifest.icons?.some(icon => icon.sizes === '192x192'), 'Missing 192×192 manifest icon.');
  assert(manifest.icons?.some(icon => icon.sizes === '512x512'), 'Missing 512×512 manifest icon.');
} catch (error) { fail(`Manifest is invalid: ${error.message}`); }

for (const [asset, width, height] of [['assets/ogp.png', 1200, 630], ['assets/icon-192.png', 192, 192],
  ['assets/icon-512.png', 512, 512], ['assets/apple-touch-icon.png', 180, 180]]) {
  try {
    const bytes = await readFile(path.join(dist, asset));
    assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) === width && bytes.readUInt32BE(20) === height,
      `${asset}: expected a ${width}×${height} PNG.`);
  } catch (error) { fail(`${asset}: ${error.message}`); }
}

try {
  const specification = JSON.parse(await readFile(path.join(project, 'scripts/ocr-assets.json'), 'utf8'));
  const prepared = JSON.parse(await readFile(path.join(dist, 'vendor/ocr/asset-list.json'), 'utf8'));
  const expected = [...specification.assets, ...specification.wrappers].map(asset => `vendor/ocr/${asset.path}`);
  for (const asset of expected) {
    assert(prepared.includes(asset), `OCR cache list is missing ${asset}. Run prepare-ocr.mjs.`);
    await requireAsset(asset);
  }
  for (const asset of prepared) await requireAsset(asset);
} catch (error) { fail(`OCR assets are not prepared: ${error.message}`); }

if (failures.length) {
  console.error(`Static validation failed (${failures.length}):\n` + failures.map(message => `- ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Static validation passed: ${appFiles.filter(name => name.endsWith('.js')).length} app modules, ${checked.size} local resources, Japanese branding, /note/ paths, manifest, PNG dimensions and prepared OCR assets.`);
}
