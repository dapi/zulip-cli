import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { VERSION } from "./version.js";

export class ZulipCliError extends Error {
  constructor(message, { code = "INTERNAL_ERROR", exitCode = 1, details = null } = {}) {
    super(message);
    this.name = "ZulipCliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

function normalizeSite(site) {
  if (!site) return null;
  const candidate = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new ZulipCliError("Invalid Zulip site URL", {
      code: "CONFIG_ERROR",
      exitCode: 2,
    });
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new ZulipCliError("Zulip site URL must use http or https", {
      code: "CONFIG_ERROR",
      exitCode: 2,
    });
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function encodeValue(value) {
  if (Array.isArray(value) || (value !== null && typeof value === "object")) {
    return JSON.stringify(value);
  }
  return String(value);
}

function stripZulipEnvelope(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { result: _result, msg: _msg, ...data } = payload;
  return data;
}

export class ZulipClient {
  constructor({ site, email, apiKey, timeoutMs = 30000, fetchImpl = globalThis.fetch } = {}) {
    this.site = normalizeSite(site);
    this.email = email;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  ensureSite() {
    if (!this.site) {
      throw new ZulipCliError("ZULIP_SITE is required", {
        code: "CONFIG_ERROR",
        exitCode: 2,
      });
    }
  }

  ensureAuth() {
    const missing = [];
    if (!this.email) missing.push("ZULIP_EMAIL");
    if (!this.apiKey) missing.push("ZULIP_API_KEY");
    if (missing.length > 0) {
      throw new ZulipCliError(`${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} required`, {
        code: "AUTH_ERROR",
        exitCode: 2,
      });
    }
  }

  async request(method, path, { query = {}, form = null, authenticated = true } = {}) {
    this.ensureSite();
    if (authenticated) this.ensureAuth();

    const url = new URL(`/api/v1/${path.replace(/^\//, "")}`, this.site);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, encodeValue(value));
    }

    const headers = {
      Accept: "application/json",
      "User-Agent": `zulip-cli/${VERSION}`,
    };
    if (authenticated) {
      headers.Authorization = `Basic ${Buffer.from(`${this.email}:${this.apiKey}`).toString("base64")}`;
    }

    let body;
    if (form) {
      const parameters = new URLSearchParams();
      for (const [key, value] of Object.entries(form)) {
        if (value !== undefined && value !== null) parameters.set(key, encodeValue(value));
      }
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = parameters;
    }

    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ZulipCliError(error.name === "TimeoutError" ? "Zulip request timed out" : `Network error: ${error.message}`, {
        code: "NETWORK_ERROR",
        exitCode: 5,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ZulipCliError(`Zulip returned a non-JSON response (HTTP ${response.status})`, {
        code: "API_ERROR",
        exitCode: 6,
      });
    }

    if (!response.ok || payload.result === "error") {
      const code = response.status === 401 ? "AUTH_ERROR" : response.status === 404 ? "NOT_FOUND" : "API_ERROR";
      throw new ZulipCliError(payload.msg || `Zulip API request failed (HTTP ${response.status})`, {
        code,
        exitCode: response.status === 401 ? 2 : response.status === 404 ? 3 : 6,
        details: {
          httpStatus: response.status,
          zulipCode: payload.code ?? null,
        },
      });
    }

    return stripZulipEnvelope(payload);
  }

  async uploadFile(filePath) {
    this.ensureSite();
    this.ensureAuth();

    const file = await readFile(filePath).catch((error) => {
      throw new ZulipCliError(`Cannot read file: ${error.message}`, {
        code: "VALIDATION_ERROR",
        exitCode: 4,
      });
    });
    const form = new FormData();
    form.set("filename", new Blob([file]), basename(filePath));

    const url = new URL("/api/v1/user_uploads", this.site);
    let response;
    try {
      response = await this.fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiKey}`).toString("base64")}`,
          "User-Agent": `zulip-cli/${VERSION}`,
        },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ZulipCliError(error.name === "TimeoutError" ? "Zulip upload timed out" : `Network error: ${error.message}`, {
        code: "NETWORK_ERROR",
        exitCode: 5,
      });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.result === "error") {
      throw new ZulipCliError(payload?.msg || `Zulip upload failed (HTTP ${response.status})`, {
        code: response.status === 401 ? "AUTH_ERROR" : "API_ERROR",
        exitCode: response.status === 401 ? 2 : 6,
      });
    }
    return stripZulipEnvelope(payload);
  }
}

export { normalizeSite };
