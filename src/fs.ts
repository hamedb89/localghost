import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readTextFile(path: string) {
  return readFileSync(path, "utf8");
}

export function writeTextFile(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf8");
  return path;
}
