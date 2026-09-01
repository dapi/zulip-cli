import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { readContent } from "../src/cli.js";

test("readContent reads multiline content from stdin", async () => {
  const inputStream = Readable.from(["first line\n", "second line\n"]);

  assert.equal(
    await readContent("-", { inputStream }),
    "first line\nsecond line\n",
  );
});
