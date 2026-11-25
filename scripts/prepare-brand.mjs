import { createRequire } from 'node:module';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The SVG source already contains outlined Japanese glyphs. Regeneration only
// requires sharp (npm install --no-save sharp), not an installed Japanese font.
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', {
  paths: [process.cwd(), process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)
}));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist/assets');
await mkdir(assets, { recursive: true });
const renders = [
  { source: 'icon.svg', target: 'icon-192.png', width: 192, height: 192 },
  { source: 'icon.svg', target: 'icon-512.png', width: 512, height: 512 },
  { source: 'icon.svg', target: 'apple-touch-icon.png', width: 180, height: 180 },
  { source: 'ogp.svg', target: 'ogp.png', width: 1200, height: 630 }
];
for (const render of renders) {
  const destination = path.join(assets, render.target);
  await sharp(path.join(assets, render.source), { density: 144 })
    .resize(render.width, render.height)
    .png({ compressionLevel: 9, palette: true, colours: 256, dither: 0 })
    .toFile(destination);
  console.log(`${render.target}: ${(await stat(destination)).size} bytes`);
}
