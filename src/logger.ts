import { Logger } from "tslog";

type AnyLogger = Logger<unknown>;

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

export const core = addStackTrace(
  new Logger({
    type: "pretty",
    name: "",
    prettyLogTemplate: "{{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}} {{name}} ",
  }),
);
export const pihanga = addStackTrace(core.getSubLogger({ name: "pihanga" }));

export function getLogger(name: string): Logger<unknown> {
  return addStackTrace(core.getSubLogger({ name }));
}
