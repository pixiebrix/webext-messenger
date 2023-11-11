import type { Browser } from "webextension-polyfill";

declare global {
  const browser: Browser;
  // eslint-disable-next-line no-var -- https://stackoverflow.com/a/69208755/288906
  var __webextMessenger: string;
}
