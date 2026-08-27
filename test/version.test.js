import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { VERSION } from "../src/version.js";

test("runtime version comes from package.json", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(VERSION, packageJson.version);
});
