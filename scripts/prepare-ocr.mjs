import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Deterministic, dependency-free preparation for GitHub Pages / Sites builds.
// Assets are downloaded at build time; recognition itself remains local.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(project, 'dist', 'vendor', 'ocr');
const manifest = JSON.parse(await readFile(new URL('./ocr-assets.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
await mkdir(destination, { recursive: true });

async function prepare(asset) {
  const output = path.join(destination, asset.path);
  if (!output.startsWith(destination + path.sep)) throw new Error('Invalid OCR asset path.');
  try {
    if (digest(await readFile(output)) === asset.sha256) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let downloaded;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${asset.path}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (digest(data) !== asset.sha256) throw new Error(`Checksum mismatch: ${asset.path}`);
      downloaded = data;
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = output + '.download';
  try {
    await writeFile(temporary, downloaded);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Prepared ${asset.path}`);
}

// Bound parallel downloads to keep CI memory and network use predictable.
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < manifest.assets.length) await prepare(manifest.assets[next++]);
}));

for (const wrapper of manifest.wrappers) {
  const code = `/* Local LSTM loader; underlying Tesseract.js core is unmodified. */\n` +
    `importScripts(new URL('./core/${wrapper.base}.js', self.location.href).href);\n` +
    `{\n  const originalCore = TesseractCore;\n` +
    `  TesseractCore = (options = {}) => originalCore({ ...options, locateFile: (name) => new URL('./core/' + name, self.location.href).href });\n}\n`;
  await writeFile(path.join(destination, wrapper.path), code);
}

const notices = `# OCR third-party notices\n\n` +
  `Tesseract.js ${manifest.tesseractVersion} and Tesseract.js-core ${manifest.tesseractVersion}\n` +
  `Copyright their respective contributors. Apache License 2.0.\n` +
  `https://github.com/naptha/tesseract.js\nhttps://github.com/naptha/tesseract.js-core\n\n` +
  `English and Japanese language data: @tesseract.js-data/eng and @tesseract.js-data/jpn ${manifest.languageDataVersion}, 4.0.0_best_int.\n` +
  `Derived from Tesseract trained language data, Apache License 2.0.\n` +
  `https://github.com/tesseract-ocr/tessdata_best\n\n` +
  `The accompanying TESSERACT-JS-LICENSE.md and TESSERACT-CORE-LICENSE contain the license terms.\n` +
  `Worker dependency notices are in worker.min.js.LICENSE.txt and tesseract.min.js.LICENSE.txt.\n` +
  `Only loader wrappers are app-authored; upstream JavaScript, WebAssembly and model bytes are unmodified.\n` +
  `All downloaded bytes are verified against SHA-256 checksums in scripts/ocr-assets.json.\n`;
await writeFile(path.join(destination, 'THIRD_PARTY.txt'), notices);
const assetPaths = [
  ...manifest.assets.map(asset => `vendor/ocr/${asset.path}`),
  ...manifest.wrappers.map(wrapper => `vendor/ocr/${wrapper.path}`),
  'vendor/ocr/THIRD_PARTY.txt',
];
await writeFile(path.join(destination, 'asset-list.json'), JSON.stringify(assetPaths, null, 2) + '\n');
console.log(`OCR ready: ${manifest.assets.length} verified assets and ${manifest.wrappers.length} adaptive loaders.`);
