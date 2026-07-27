import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("package.json version is missing.");
}

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const badge = "[![npm version](https://img.shields.io/npm/v/@hamedb89/localghost?logo=npm)](https://www.npmjs.com/package/@hamedb89/localghost)";

if (!readme.includes(badge)) {
  throw new Error("Could not find npm version badge in README.md.");
}
const nextReadme = readme;

const updateCheckPath = join(root, "src", "update-check.ts");
const updateCheck = readFileSync(updateCheckPath, "utf8");
const localghostVersionPattern = /export const LOCALGHOST_VERSION = "[^"]+";/;

if (!localghostVersionPattern.test(updateCheck)) {
  throw new Error("Could not find LOCALGHOST_VERSION in src/update-check.ts.");
}

const nextUpdateCheck = updateCheck.replace(localghostVersionPattern, `export const LOCALGHOST_VERSION = "${version}";`);

const changes = [
  ...(nextReadme !== readme ? ["README.md"] : []),
  ...(nextUpdateCheck !== updateCheck ? ["src/update-check.ts"] : [])
];

if (checkOnly) {
  if (changes.length > 0) {
    throw new Error(`Version metadata is out of sync: ${changes.join(", ")}`);
  }
  process.exit(0);
}

writeFileSync(readmePath, nextReadme, "utf8");
writeFileSync(updateCheckPath, nextUpdateCheck, "utf8");
