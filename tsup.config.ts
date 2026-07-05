import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/vite.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "node20"
});
