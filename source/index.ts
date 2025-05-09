// Imports must use the .js extension because ESM requires it and TS refuses to rewrite .ts to .js

export * from "./receiver.js";
export * from "./sender.js";
export * from "./types.js";
export * from "./events.js";
export { getThisFrame, getTopLevelFrame } from "./thisTarget.js";
export { toggleLogging } from "./logging.js";
export { MessengerError } from "./shared.js";

import { initPrivateApi } from "./thisTarget.js";

// Required side effect to better track errors:
// https://github.com/pixiebrix/webext-messenger/pull/80
initPrivateApi();
