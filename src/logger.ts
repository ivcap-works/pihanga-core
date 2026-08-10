import { Logger } from "tslog";

type AnyLogger = Logger<unknown>;

// ── Log-level types ──────────────────────────────────────────────────────────

/** tslog v4 named log levels (low → high). */
export type LogLevelName =
  | "silly"
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

const LOG_LEVEL_MAP: Record<LogLevelName, number> = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6,
};

/**
 * Logging configuration accepted by {@link setLogConfig} and `StartProps.logging`.
 *
 * @example
 * ```ts
 * // In start() opts — set global level and silence the "rest" block in prod:
 * start(initState, [appInit], {
 *   logging: { level: "info", blocks: { rest: "warn" } },
 * });
 *
 * // At runtime — enable debug for a single block:
 * import { setLogConfig } from "@pihanga2/core";
 * setLogConfig({ blocks: { "my/feature": "debug" } });
 * ```
 */
export type LogConfig = {
  /** Global minimum log level applied to all loggers. Default: `"info"`. */
  level?: LogLevelName;
  /**
   * Per-named-logger level overrides.
   * Keys are the `name` strings passed to {@link getLogger}.
   * Merged (not replaced) on repeated calls to {@link setLogConfig}.
   *
   * @example `{ rest: "warn", "my/feature": "debug" }`
   */
  blocks?: Record<string, LogLevelName>;
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function setLevel(logger: AnyLogger, level: LogLevelName): void {
  // tslog v4 exposes settings as a mutable object
  (logger as any).settings.minLevel = LOG_LEVEL_MAP[level];
}

/** Patches warn/error on a tslog Logger to always include a stack trace. */
function addStackTrace(logger: AnyLogger): AnyLogger {
  const origWarn = logger.warn.bind(logger);
  const origError = logger.error.bind(logger);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (logger as any).warn = (...args: unknown[]) => {
    const hasError = args.some((a) => a instanceof Error);
    return origWarn(...args, ...(hasError ? [] : [new Error()]));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (logger as any).error = (...args: unknown[]) => {
    const hasError = args.some((a) => a instanceof Error);
    return origError(...args, ...(hasError ? [] : [new Error()]));
  };

  return logger;
}

// ── State ────────────────────────────────────────────────────────────────────

/** All named loggers created so far (keyed by name). */
const namedLoggers: Record<string, AnyLogger> = {};

/** Accumulated configuration — merged across successive {@link setLogConfig} calls. */
let _config: LogConfig = {};

// ── Public API ───────────────────────────────────────────────────────────────

export const core = addStackTrace(
  new Logger({
    type: "pretty",
    name: "",
    prettyLogTemplate: "{{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}} {{name}} ",
  }),
);
export const pihanga = addStackTrace(core.getSubLogger({ name: "pihanga" }));
namedLoggers["pihanga"] = pihanga;

/**
 * Apply (or update) the logging configuration.
 *
 * - `level` sets the global minimum level on the root logger; all sub-loggers
 *   without an explicit block override inherit it automatically (tslog propagation).
 * - `blocks` keys that match an existing logger name are applied immediately;
 *   keys for loggers not yet created are stored and applied when the logger
 *   is first requested via {@link getLogger}.
 *
 * Successive calls **merge** into the accumulated config rather than replacing it.
 */
export function setLogConfig(config: LogConfig): void {
  _config = {
    ..._config,
    ...config,
    blocks: { ..._config.blocks, ...config.blocks },
  };

  if (_config.level) {
    setLevel(core, _config.level);
  }

  for (const [name, level] of Object.entries(_config.blocks ?? {})) {
    const l = namedLoggers[name];
    if (l) setLevel(l, level);
  }
}

/**
 * Return (or create) a named sub-logger of the root `core` logger.
 *
 * Loggers are cached — repeated calls with the same name return the same instance.
 * Any block-level override already registered via {@link setLogConfig} is applied
 * immediately on first creation.
 */
export function getLogger(name: string): Logger<unknown> {
  if (!namedLoggers[name]) {
    const l = addStackTrace(core.getSubLogger({ name }));
    namedLoggers[name] = l;
    const blockLevel = _config.blocks?.[name];
    if (blockLevel) setLevel(l, blockLevel);
  }
  return namedLoggers[name];
}
