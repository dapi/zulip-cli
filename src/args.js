const BOOLEAN_OPTIONS = new Set([
  "help",
  "version",
  "raw",
  "subscribed",
  "include-inactive",
  "include-bots",
]);

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 4;
    this.code = "VALIDATION_ERROR";
  }
}

export function parseArgs(argv) {
  const tokens = [...argv];
  let command = tokens.shift();
  if (command?.startsWith("--")) {
    tokens.unshift(command);
    command = undefined;
  }
  const options = {};
  const positionals = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--") {
      positionals.push(...tokens.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    if (token.startsWith("--no-")) {
      options[token.slice(5)] = false;
      continue;
    }

    const equalsIndex = token.indexOf("=");
    const name = token.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    if (!name) {
      throw new UsageError("Option name cannot be empty");
    }
    if (equalsIndex !== -1) {
      options[name] = token.slice(equalsIndex + 1);
      continue;
    }
    if (BOOLEAN_OPTIONS.has(name)) {
      options[name] = true;
      continue;
    }
    if (index + 1 >= tokens.length || tokens[index + 1].startsWith("--")) {
      throw new UsageError(`Option --${name} requires a value`);
    }
    options[name] = tokens[index + 1];
    index += 1;
  }

  return { command, options, positionals };
}

export function requireOption(options, name) {
  const value = options[name];
  if (value === undefined || value === "") {
    throw new UsageError(`Missing required option --${name}`);
  }
  return value;
}

export function integerOption(options, name, defaultValue, limits = {}) {
  const raw = options[name];
  if (raw === undefined) return defaultValue;
  if (!/^-?\d+$/.test(String(raw))) {
    throw new UsageError(`Option --${name} must be an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new UsageError(`Option --${name} is outside the safe integer range`);
  }
  if (limits.min !== undefined && value < limits.min) {
    throw new UsageError(`Option --${name} must be at least ${limits.min}`);
  }
  if (limits.max !== undefined && value > limits.max) {
    throw new UsageError(`Option --${name} must be at most ${limits.max}`);
  }
  return value;
}

export function booleanOption(options, name, defaultValue = false) {
  const value = options[name];
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new UsageError(`Option --${name} must be true or false`);
}
