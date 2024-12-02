import "./webextensionPolyfill.js";
import "./background/registration.ts";
import "./contentscript/api.test.ts";

async function init() {
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      // @ts-expect-error wrong?
      reasons: ["DOM_PARSER"],
      justification: "testing",
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    if (!(error as any).message.includes("Only a single offscreen")) {
      throw error;
    }
  }
}

void init();
