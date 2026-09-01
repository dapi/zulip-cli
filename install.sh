#!/usr/bin/env sh
set -eu

ZULIP_CLI_VERSION=${ZULIP_CLI_VERSION:-v0.2.1}

command -v npm >/dev/null 2>&1 || {
  printf '%s\n' 'npm is required. Install Node.js 20 or newer and retry.' >&2
  exit 1
}

command -v npx >/dev/null 2>&1 || {
  printf '%s\n' 'npx is required. Install Node.js 20 or newer and retry.' >&2
  exit 1
}

npm install --global "github:dapi/zulip-cli#${ZULIP_CLI_VERSION}"
npx skills add "https://github.com/dapi/zulip-cli/tree/${ZULIP_CLI_VERSION}" \
  --skill zulip-cli --agent '*' -g -y
