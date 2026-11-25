import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Google Fonts distributes Yomogi under SIL Open Font License 1.1.
// Downloads are pinned by SHA-256: upstream changes fail closed until reviewed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist/assets');
const files = [
  { name: 'Yomogi-Regular.ttf', source: 'Yomogi-Regular.ttf', sha256: 'ec280f473a03187292905618f24fdb08a6dcbf8620b52637e3b589fe745259b9' },
  { name: 'Yomogi-OFL.txt', source: 'OFL.txt', sha256: 'bc0330d5973ab1f200553f51b4cb4ef11b81187fdcd0249f7f83992726c02a48' }
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(assets, { recursive: true });
for (const file of files) {
  const destination = path.join(assets, file.name);
  try {
    if (digest(await readFile(destination)) === file.sha256) {
      console.log(`Verified ${file.name}`);
      continue;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const source = `https://raw.githubusercontent.com/google/fonts/main/ofl/yomogi/${file.source}`;
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${file.name}: download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== file.sha256) throw new Error(`${file.name}: SHA-256 does not match the reviewed font; refusing changed content`);
  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  console.log(`Prepared ${file.name}`);
}
