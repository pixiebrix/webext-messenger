import "./webextensionPolyfill.js";
import "./background/registration.ts";
import "./contentscript/api.test.ts";

chrome.runtime.onMessage.addListener((message) => {
  console.log("message", message);
  if (message === "open-options-page") {
    void chrome.runtime.openOptionsPage();
  }
});
