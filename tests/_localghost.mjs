export async function importLocalghost() {
  return process.env.LOCALGHOST_TEST_SOURCE === "1"
    ? import("../src/index.ts")
    : import("../dist/index.js");
}
