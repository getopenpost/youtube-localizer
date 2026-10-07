import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
const files = {};
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[path] = new Uint8Array(await readFile(path));
  }
}
for (const dir of ['src', 'public', 'scripts', 'vendor', 'docs'])
  await collect(dir);
for (const entry of await readdir('.', { withFileTypes: true }))
  if (
    entry.isFile() &&
    /\.(?:html|json|js|ts|md)$/.test(entry.name) &&
    !entry.name.startsWith('.')
  )
    files[entry.name] = new Uint8Array(await readFile(entry.name));
files['.prettierrc.json'] = new Uint8Array(await readFile('.prettierrc.json'));
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/youtube-localizer-source.zip', zipSync(files));
