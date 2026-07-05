import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("package.json version is missing.");
}

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const badge = `[![npm version](https://img.shields.io/badge/npm-v${version}-CB3837?logo=npm)](https://www.npmjs.com/package/@hamedb89/localghost)`;

const next = readme.replace(
  /\[!\[npm version\]\(https:\/\/img\.shields\.io\/(?:npm\/v\/@hamedb89\/localghost\.svg|badge\/npm-v[^)-]+-CB3837\?logo=npm)\)\]\(https:\/\/www\.npmjs\.com\/package\/@hamedb89\/localghost\)/,
  badge
);

if (next === readme) {
  throw new Error("Could not find npm version badge in README.md.");
}

writeFileSync(readmePath, next, "utf8");
