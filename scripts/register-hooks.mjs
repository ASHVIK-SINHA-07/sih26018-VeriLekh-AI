/** Registers the `@/*` alias hook. Used via `node --import`. */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL(`${import.meta.dirname}/`));
