import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';
const files = {};
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative('dist', path)] = new Uint8Array(await readFile(path));
  }
}
await collect('dist');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/youtube-localizer-0.1.0.zip', zipSync(files));
console.log('artifacts/youtube-localizer-0.1.0.zip');
