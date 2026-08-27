import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SKILL.md has matching installable skill metadata", async () => {
  const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /^---\nname: zulip-cli\ndescription: .+\n---\n/);
  assert.match(skill, /npm install -g github:dapi\/zulip-cli/);
  assert.match(
    skill,
    /npx skills add https:\/\/github\.com\/dapi\/zulip-cli\/tree\/v\d+\.\d+\.\d+/,
  );
});
