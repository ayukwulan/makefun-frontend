import { mkdirSync, cpSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildDossier } from "./vendor/makefun-frontend.ts";
const sourceDirectory = fileURLToPath(new URL(".", import.meta.url));
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outputDirectory, { recursive: true });
for (const folder of ["app", "screenshots"]) {
  const target = resolve(outputDirectory, folder);
  mkdirSync(target, { recursive: true });
  if (existsSync(resolve(sourceDirectory, folder))) cpSync(resolve(sourceDirectory, folder), target, { recursive: true });
}
// Package the copied tree with the entry's fixed submission limits.
const dossierBytes = buildDossier(outputDirectory, {
  app_max_bytes: 16777216, app_max_files: 993,
  screenshots: { max_bytes: 262144, max: 3 }, text_max_bytes: 163840
});
writeFileSync(resolve(outputDirectory, "dossier.json"), dossierBytes);
