# zulip-cli

Non-interactive, JSON-first Zulip CLI for AI agents and automation. It reads,
searches, and sends messages; discovers channels, topics, and users; and uploads
files through the official Zulip REST API.

## Install CLI + agent skill

Requires Node.js 20 or newer on macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/dapi/zulip-cli/main/install.sh | sh
```

Manual installation:

```sh
npm install -g github:dapi/zulip-cli
npx skills add dapi/zulip-cli --skill zulip-cli --agent '*' -g -y
```

Restart the agent session after installing the skill.

## Configure access

Create an API key in Zulip under **Personal settings → Account & privacy → API
key**, then export:

```sh
export ZULIP_SITE=https://zulip.example.com
export ZULIP_EMAIL=you@example.com
export ZULIP_API_KEY=<api-key>
```

Keep `ZULIP_API_KEY` in a secret manager. Do not commit it or save it in a
plaintext `.env` file.

Connectivity and authentication checks:

```sh
zulip server-info
zulip user-me
```

Every operational command returns a stable JSON envelope:

```json
{"ok":true,"data":{}}
```

Errors are emitted to stderr with a non-zero exit code:

```json
{"ok":false,"error":{"code":"AUTH_ERROR","message":"...","details":null}}
```

## Commands

```sh
zulip commands
zulip server-info
zulip user-me
zulip user-list
zulip stream-list --subscribed
zulip topic-list --stream-id 42

zulip message-list --limit 50 --raw
zulip message-list --stream general --topic deploy --limit 100 --raw
zulip message-search --query "release failed" --stream general --raw
zulip message-info --message-id 123 --raw

zulip message-send --stream general --topic deploy --content @message.md
printf '%s\n' 'Hello' | zulip message-send --to user@example.com --content -
zulip file-upload --file ./report.pdf
```

Use `zulip --help` for human-readable help or `zulip commands` for a
machine-readable command catalog.

### Message filters

`message-list` and `message-search` accept `--stream`, `--topic`, `--sender`,
and `--raw`. `message-list` also accepts `--search` and `--narrow-json` for an
arbitrary Zulip narrow array.

```sh
zulip message-list \
  --narrow-json '[{"operator":"is","operand":"unread"}]' \
  --limit 100 \
  --raw
```

## Authentication variables

| Variable | Required | Description |
|---|---:|---|
| `ZULIP_SITE` | Yes | Organization base URL, for example `https://zulip.example.com` |
| `ZULIP_EMAIL` | For authenticated commands | User or bot email address |
| `ZULIP_API_KEY` | For authenticated commands | API key belonging to that email |

The equivalent `--site`, `--email`, and `--api-key` options are available, but
putting secrets on the command line is discouraged.

## Development

```sh
npm install
npm test
npm run check
```

## License

MIT
