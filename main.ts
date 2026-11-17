import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
if (output === resolve(root) || ['app','screenshots','vendor'].some(name => output === join(root,name) || output.startsWith(join(root,name) + '/'))) throw new Error('Output cannot overwrite source files.');
mkdirSync(output, { recursive: true });

function exportTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const item of readdirSync(source, { withFileTypes: true })) {
    const from = join(source,item.name), to = join(destination,item.name);
    if (item.isDirectory()) exportTree(from,to);
    else if (item.isFile()) writeFileSync(to,readFileSync(from));
    else throw new Error('Only ordinary files can be packaged: ' + from);
  }
}
for (const directory of ['app','screenshots']) {
  const destination = join(output,directory);
  rmSync(destination, { recursive: true, force: true });
  exportTree(join(root,directory),destination);
}
const dossier = buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216
});
writeFileSync(join(output,'dossier.json'),dossier);
console.log('Packaged app, screenshots, and dossier in ' + output);
