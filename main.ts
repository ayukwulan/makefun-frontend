import { readdir, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
const targetRoot = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const sources = ['app', 'screenshots'];
if (resolve(sourceRoot).startsWith(targetRoot + sep)) throw new Error('The output directory cannot contain this repository.');
if (targetRoot === resolve(sourceRoot) || sources.concat('vendor').some(name => {
  const protectedPath = resolve(sourceRoot, name);
  return targetRoot === protectedPath || targetRoot.startsWith(protectedPath + sep);
})) throw new Error('Choose an output directory separate from the source trees.');

async function packageDirectory(relativePath, destination) {
  const source = join(sourceRoot, relativePath);
  await mkdir(destination, { recursive: true });
  const children = (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    const relative = join(relativePath, child.name), output = join(destination, child.name);
    if (child.isDirectory()) await packageDirectory(relative, output);
    else if (child.isFile()) await writeFile(output, await readFile(join(sourceRoot, relative)));
    else throw new Error('Packaging requires ordinary files: ' + relative);
  }
}

await mkdir(targetRoot, { recursive: true });
for (const directory of sources) {
  const destination = join(targetRoot, directory);
  await rm(destination, { force: true, recursive: true });
  await packageDirectory(directory, destination);
}
const caps = { text_max_bytes: 163840, screenshots: { max: 3, max_bytes: 262144 }, app_max_files: 993, app_max_bytes: 16777216 };
const dossierBytes = buildDossier(targetRoot, caps);
await writeFile(join(targetRoot, 'dossier.json'), dossierBytes);
console.log(`make.fun app and captures packaged at ${targetRoot} · dossier ${dossierBytes.length} bytes`);
