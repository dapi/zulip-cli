import { readFile } from "node:fs/promises";
import { stdout as output, stderr as errorOutput } from "node:process";

import {
  booleanOption,
  integerOption,
  parseArgs,
  requireOption,
  UsageError,
} from "./args.js";
import { ZulipClient, ZulipCliError } from "./client.js";

const VERSION = "0.1.0";

const COMMANDS = [
  { name: "server-info", auth: false, description: "Get public Zulip server settings" },
  { name: "user-me", auth: true, description: "Get the authenticated user" },
  { name: "user-list", auth: true, description: "List organization users" },
  { name: "stream-list", auth: true, description: "List channels, optionally only subscriptions" },
  { name: "topic-list", auth: true, description: "List topics in a channel" },
  { name: "message-list", auth: true, description: "Read recent messages using optional narrow filters" },
  { name: "message-search", auth: true, description: "Search messages" },
  { name: "message-info", auth: true, description: "Fetch one message by ID" },
  { name: "message-send", auth: true, mutation: true, description: "Send a channel or direct message" },
  { name: "file-upload", auth: true, mutation: true, description: "Upload a file and return its Zulip URL" },
  { name: "commands", auth: false, description: "List commands and their options" },
];

const COMMAND_OPTIONS = {
  "server-info": [],
  "user-me": [],
  "user-list": ["--include-inactive", "--include-bots"],
  "stream-list": ["--subscribed"],
  "topic-list": ["--stream-id <id>"],
  "message-list": [
    "--limit <1..1000>",
    "--anchor <newest|oldest|first_unread|message-id>",
    "--stream <name-or-id>",
    "--topic <name>",
    "--sender <email-or-id>",
    "--search <query>",
    "--narrow-json <json-array>",
    "--raw",
  ],
  "message-search": [
    "--query <text>",
    "--limit <1..1000>",
    "--stream <name-or-id>",
    "--topic <name>",
    "--sender <email-or-id>",
    "--raw",
  ],
  "message-info": ["--message-id <id>", "--raw"],
  "message-send": [
    "--stream <name-or-id> --topic <topic>",
    "or --to <email-or-id[,email-or-id]>",
    "--content <text|@file|->",
  ],
  "file-upload": ["--file <path>"],
  commands: [],
};

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function success(data) {
  writeJson(output, { ok: true, data });
}

function failure(error) {
  const known = error instanceof ZulipCliError || error instanceof UsageError;
  const code = known ? error.code : "INTERNAL_ERROR";
  const details = known ? (error.details ?? null) : null;
  writeJson(errorOutput, {
    ok: false,
    error: {
      code,
      message: error.message || String(error),
      details,
    },
  });
  return known ? error.exitCode : 1;
}

function helpText() {
  return `zulip-cli ${VERSION}

JSON-first Zulip CLI for AI agents and automation.

Usage:
  zulip <command> [options]

Commands:
${COMMANDS.map((command) => `  ${command.name.padEnd(16)} ${command.description}`).join("\n")}

Global options:
  --site <url>          Override ZULIP_SITE
  --email <email>       Override ZULIP_EMAIL
  --api-key <key>       Override ZULIP_API_KEY (environment variable is safer)
  --timeout <ms>        Request timeout (default: 30000)
  --help                Show this help
  --version             Show the version

Run "zulip commands" for a machine-readable command catalog.`;
}

function parseNarrowJson(raw) {
  if (!raw) return [];
  let narrow;
  try {
    narrow = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`Option --narrow-json must contain valid JSON: ${error.message}`);
  }
  if (!Array.isArray(narrow)) {
    throw new UsageError("Option --narrow-json must contain a JSON array");
  }
  return narrow;
}

function buildNarrow(options, forcedSearch = null) {
  const narrow = parseNarrowJson(options["narrow-json"]);
  if (options.stream !== undefined) narrow.push({ operator: "channel", operand: parseIdentifier(options.stream) });
  if (options.topic !== undefined) narrow.push({ operator: "topic", operand: options.topic });
  if (options.sender !== undefined) narrow.push({ operator: "sender", operand: parseIdentifier(options.sender) });
  const search = forcedSearch ?? options.search;
  if (search !== undefined) narrow.push({ operator: "search", operand: search });
  return narrow;
}

function parseIdentifier(value) {
  return /^\d+$/.test(String(value)) ? Number(value) : value;
}

function parseRecipients(value) {
  const recipients = String(value)
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean)
    .map(parseIdentifier);
  if (recipients.length === 0) throw new UsageError("Option --to must include at least one recipient");
  return recipients;
}

async function readContent(specification) {
  if (specification === "-") return readFile(0, "utf8");
  if (specification.startsWith("@")) {
    const path = specification.slice(1);
    if (!path) throw new UsageError("Content file path cannot be empty");
    return readFile(path, "utf8").catch((error) => {
      throw new UsageError(`Cannot read content file: ${error.message}`);
    });
  }
  return specification;
}

function createClient(options, environment) {
  return new ZulipClient({
    site: options.site ?? environment.ZULIP_SITE,
    email: options.email ?? environment.ZULIP_EMAIL,
    apiKey: options["api-key"] ?? environment.ZULIP_API_KEY,
    timeoutMs: integerOption(options, "timeout", 30000, { min: 1, max: 300000 }),
  });
}

async function execute(command, options, client) {
  switch (command) {
    case "commands":
      return COMMANDS.map((item) => ({ ...item, options: COMMAND_OPTIONS[item.name] }));
    case "server-info":
      return client.request("GET", "server_settings", { authenticated: false });
    case "user-me":
      return client.request("GET", "users/me");
    case "user-list":
      return client.request("GET", "users", {
        query: {
          include_deactivated: booleanOption(options, "include-inactive", false),
          exclude_system_bots: !booleanOption(options, "include-bots", false),
        },
      });
    case "stream-list":
      if (booleanOption(options, "subscribed", false)) {
        return client.request("GET", "users/me/subscriptions");
      }
      return client.request("GET", "streams", { query: { include_public: true, include_subscribed: true } });
    case "topic-list": {
      const streamId = integerOption(options, "stream-id", undefined, { min: 1 });
      if (streamId === undefined) throw new UsageError("Missing required option --stream-id");
      return client.request("GET", `users/me/${streamId}/topics`);
    }
    case "message-list": {
      const limit = integerOption(options, "limit", 50, { min: 1, max: 1000 });
      return client.request("GET", "messages", {
        query: {
          anchor: options.anchor ?? "newest",
          num_before: limit,
          num_after: 0,
          narrow: buildNarrow(options),
          apply_markdown: !booleanOption(options, "raw", false),
          allow_empty_topic_name: true,
        },
      });
    }
    case "message-search": {
      const query = requireOption(options, "query");
      const limit = integerOption(options, "limit", 50, { min: 1, max: 1000 });
      return client.request("GET", "messages", {
        query: {
          anchor: options.anchor ?? "newest",
          num_before: limit,
          num_after: 0,
          narrow: buildNarrow(options, query),
          apply_markdown: !booleanOption(options, "raw", false),
          allow_empty_topic_name: true,
        },
      });
    }
    case "message-info": {
      const messageId = integerOption(options, "message-id", undefined, { min: 1 });
      if (messageId === undefined) throw new UsageError("Missing required option --message-id");
      return client.request("GET", `messages/${messageId}`, {
        query: {
          apply_markdown: !booleanOption(options, "raw", false),
          allow_empty_topic_name: true,
        },
      });
    }
    case "message-send": {
      const hasStream = options.stream !== undefined;
      const hasRecipients = options.to !== undefined;
      if (hasStream === hasRecipients) {
        throw new UsageError("Specify exactly one destination: --stream or --to");
      }
      const content = await readContent(requireOption(options, "content"));
      if (hasStream) {
        return client.request("POST", "messages", {
          form: {
            type: "channel",
            to: parseIdentifier(options.stream),
            topic: requireOption(options, "topic"),
            content,
          },
        });
      }
      return client.request("POST", "messages", {
        form: {
          type: "direct",
          to: parseRecipients(options.to),
          content,
        },
      });
    }
    case "file-upload":
      return client.uploadFile(requireOption(options, "file"));
    default:
      throw new UsageError(`Unknown command: ${command}`);
  }
}

export async function run(argv, { environment = process.env } = {}) {
  const { command, options, positionals } = parseArgs(argv);
  if (positionals.length > 0) throw new UsageError(`Unexpected positional arguments: ${positionals.join(" ")}`);

  if (options.version || command === "version") {
    output.write(`${VERSION}\n`);
    return 0;
  }
  if (options.help || command === "help" || !command) {
    output.write(`${helpText()}\n`);
    return 0;
  }
  if (options.format !== undefined && options.format !== "json") {
    throw new UsageError("Only --format json is supported");
  }

  const data = await execute(command, options, createClient(options, environment));
  success(data);
  return 0;
}

export async function main(argv) {
  try {
    process.exitCode = await run(argv);
  } catch (error) {
    process.exitCode = failure(error);
  }
}

export { COMMANDS, COMMAND_OPTIONS, buildNarrow, parseRecipients, readContent };
