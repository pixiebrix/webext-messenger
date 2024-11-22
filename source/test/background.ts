import "./webextensionPolyfill.js";
import "./background/registration.ts";
import "./contentscript/api.test.ts";

void chrome.offscreen.createDocument({
    url: 'offscreen.html',
    // @ts-expect-error wrong?
    reasons: ['DOM_PARSER'],
    justification: 'testing'
});
