import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSite, ZulipClient, ZulipCliError } from "../src/client.js";

test("normalizeSite adds https and removes a trailing slash", () => {
  assert.equal(normalizeSite("zulip.example.com/"), "https://zulip.example.com");
});

test("public requests do not require credentials", async () => {
  let received;
  const client = new ZulipClient({
    site: "https://zulip.example.com",
    fetchImpl: async (url, options) => {
      received = { url: String(url), options };
      return Response.json({ result: "success", msg: "", zulip_version: "10.0" });
    },
  });

  const data = await client.request("GET", "server_settings", { authenticated: false });
  assert.equal(received.url, "https://zulip.example.com/api/v1/server_settings");
  assert.equal(received.options.headers.Authorization, undefined);
  assert.deepEqual(data, { zulip_version: "10.0" });
});

test("authenticated GET requests encode narrows and basic auth", async () => {
  let received;
  const client = new ZulipClient({
    site: "https://zulip.example.com",
    email: "agent@example.com",
    apiKey: "secret",
    fetchImpl: async (url, options) => {
      received = { url: new URL(url), options };
      return Response.json({ result: "success", msg: "", messages: [] });
    },
  });

  const narrow = [{ operator: "channel", operand: "general" }];
  await client.request("GET", "messages", { query: { narrow } });
  assert.equal(received.url.searchParams.get("narrow"), JSON.stringify(narrow));
  assert.equal(
    received.options.headers.Authorization,
    `Basic ${Buffer.from("agent@example.com:secret").toString("base64")}`,
  );
});

test("POST requests JSON-encode array values", async () => {
  let body;
  const client = new ZulipClient({
    site: "https://zulip.example.com",
    email: "agent@example.com",
    apiKey: "secret",
    fetchImpl: async (_url, options) => {
      body = String(options.body);
      return Response.json({ result: "success", msg: "", id: 123 });
    },
  });

  const data = await client.request("POST", "messages", {
    form: { type: "direct", to: [7, 8], content: "hello" },
  });
  const parameters = new URLSearchParams(body);
  assert.equal(parameters.get("to"), "[7,8]");
  assert.deepEqual(data, { id: 123 });
});

test("missing credentials fail before a network request", async () => {
  const client = new ZulipClient({ site: "https://zulip.example.com" });
  await assert.rejects(
    client.request("GET", "users/me"),
    (error) => error instanceof ZulipCliError && error.code === "AUTH_ERROR" && error.exitCode === 2,
  );
});

test("Zulip API errors preserve useful metadata", async () => {
  const client = new ZulipClient({
    site: "https://zulip.example.com",
    email: "agent@example.com",
    apiKey: "wrong",
    fetchImpl: async () => Response.json(
      { result: "error", msg: "Incorrect API key", code: "BAD_REQUEST" },
      { status: 401 },
    ),
  });

  await assert.rejects(
    client.request("GET", "users/me"),
    (error) => error.code === "AUTH_ERROR" && error.details.httpStatus === 401,
  );
});
