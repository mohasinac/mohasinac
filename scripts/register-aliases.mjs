/**
 * Install the alias resolver hooks. Use via `node --import ./scripts/register-aliases.mjs`.
 *
 * A separate file from the hooks themselves because `register()` loads them in
 * a dedicated module-loader thread, so the hooks cannot be in the same module
 * that registers them.
 */
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
