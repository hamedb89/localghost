import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "_site");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(root, "site"), outDir, { recursive: true });

const assetsDir = join(root, "assets");
if (existsSync(assetsDir)) {
  mkdirSync(join(outDir, "assets"), { recursive: true });
  cpSync(assetsDir, join(outDir, "assets"), { recursive: true });
}

writeFileSync(join(outDir, ".nojekyll"), "", "utf8");
console.log(`Built ${outDir}`);
