import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve as absolutePath } from 'node:path';
import { fileURLToPath as urlPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const entryRoot = urlPath(new URL('./', import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(destination, { recursive: true });

for (const subtree of ['app', 'screenshots']) {
  const original = absolutePath(entryRoot, subtree);
  const exported = absolutePath(destination, subtree);
  mkdirSync(exported, { recursive: true });
  if (existsSync(original)) cpSync(original, exported, { recursive: true });
}

// These limits match the entry kit; inspect the exported tree when packaging.
const entryLimits = {
  text_max_bytes: 163_840,
  screenshots: { max: 3, max_bytes: 262_144 },
  app_max_files: 993,
  app_max_bytes: 16_777_216
};
const submission = buildDossier(destination, entryLimits);
writeFileSync(absolutePath(destination, 'dossier.json'), submission);
