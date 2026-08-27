#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const version = packageJson.version;
const expectedTag = `v${version}`;
const releaseTag = process.env.RELEASE_TAG || process.argv[2];

if (!semverPattern.test(version)) {
  throw new Error(`package.json version is not valid SemVer: ${version}`);
}

if (releaseTag && releaseTag !== expectedTag) {
  throw new Error(`Release tag ${releaseTag} does not match package version ${expectedTag}`);
}

for (const relativePath of ["README.md", "SKILL.md", "install.sh"]) {
  const contents = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  if (!contents.includes(expectedTag)) {
    throw new Error(`${relativePath} does not contain the pinned release ${expectedTag}`);
  }
}

process.stdout.write(`Release metadata is consistent for ${expectedTag}\n`);
