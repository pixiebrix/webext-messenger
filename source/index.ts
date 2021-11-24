// Imports must use the .js extension because of ESM requires it and TS refuses to rewrite .ts to .js
// This works in TS even if the .js doesn't exist, but it breaks Parcel (the tests builder)
// For this reason, there's an `alias` field in package.json to redirect these imports.
// If you see "@parcel/resolver-default: Cannot load file './yourNewFile.js'" you need to add it to the `alias` list
// 🥲

export * from "./receiver.js";
export * from "./sender.js";
export * from "./types.js";
import { initPrivateApi } from "./thisTarget.js";

initPrivateApi();
