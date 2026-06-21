import {Logger} from "tslog";

export const core = new Logger({
  type: "pretty",
  name: "",
  prettyLogTemplate: "{{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}} {{name}} ",
});
export const pihanga = core.getSubLogger({name: "pihanga"});

export function getLogger(name: string): Logger<unknown> {
  return core.getSubLogger({name});
}
