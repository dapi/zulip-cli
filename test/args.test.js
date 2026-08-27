import assert from "node:assert/strict";
import test from "node:test";

import { booleanOption, integerOption, parseArgs, UsageError } from "../src/args.js";
import { buildNarrow, parseRecipients } from "../src/cli.js";

test("parseArgs handles values, flags, and equals syntax", () => {
  assert.deepEqual(
    parseArgs(["message-list", "--stream", "general", "--raw", "--limit=25"]),
    {
      command: "message-list",
      options: { stream: "general", raw: true, limit: "25" },
      positionals: [],
    },
  );
});

test("parseArgs accepts global flags without a command", () => {
  assert.deepEqual(parseArgs(["--help"]), {
    command: undefined,
    options: { help: true },
    positionals: [],
  });
});

test("integerOption validates limits", () => {
  assert.equal(integerOption({ limit: "42" }, "limit", 10, { min: 1, max: 100 }), 42);
  assert.throws(
    () => integerOption({ limit: "101" }, "limit", 10, { max: 100 }),
    UsageError,
  );
});

test("booleanOption accepts explicit boolean strings", () => {
  assert.equal(booleanOption({ active: "true" }, "active"), true);
  assert.equal(booleanOption({ active: "0" }, "active"), false);
});

test("buildNarrow combines structured filters", () => {
  assert.deepEqual(
    buildNarrow({
      stream: "42",
      topic: "deploy",
      sender: "bot@example.com",
      search: "failed",
    }),
    [
      { operator: "channel", operand: 42 },
      { operator: "topic", operand: "deploy" },
      { operator: "sender", operand: "bot@example.com" },
      { operator: "search", operand: "failed" },
    ],
  );
});

test("parseRecipients supports user IDs and emails", () => {
  assert.deepEqual(parseRecipients("12, danil@example.com"), [12, "danil@example.com"]);
});
