import browser from "webextension-polyfill";

// @ts-expect-error Required until https://github.com/mozilla/webextension-polyfill/pull/376 or https://github.com/pixiebrix/webext-messenger/issues/67#issuecomment-1147121474
globalThis.browser = browser;
