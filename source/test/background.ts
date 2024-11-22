import "./webextensionPolyfill.js";
import "./background/registration.ts";
import "./contentscript/api.test.ts";
import { onExtensionStart } from "webext-events";

onExtensionStart.addListener(() => {
  void browser.runtime.openOptionsPage();

  void chrome.offscreen.createDocument({
      url: 'offscreen.html',
      // @ts-expect-error wrong?
      reasons: ['DOM_PARSER'],
      justification: 'testing'
  });
});
