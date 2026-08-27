#!/usr/bin/env sh
set -eu

command -v npm >/dev/null 2>&1 || {
  printf '%s\n' 'npm is required. Install Node.js 20 or newer and retry.' >&2
  exit 1
}

command -v npx >/dev/null 2>&1 || {
  printf '%s\n' 'npx is required. Install Node.js 20 or newer and retry.' >&2
  exit 1
}

npm install --global github:dapi/zulip-cli
npx skills add dapi/zulip-cli --skill zulip-cli --agent '*' -g -y
