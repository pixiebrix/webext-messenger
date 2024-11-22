import "./webextensionPolyfill.js";
import "./background/registration.ts";
import "./contentscript/api.test.ts";
import { onExtensionStart } from "webext-events";

onExtensionStart.addListener(() => {
  void browser.runtime.openOptionsPage();
});
