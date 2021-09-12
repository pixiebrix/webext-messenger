import * as test from "fresh-tape";
import { Target } from "../../../index";
import {
  getPageTitle,
  setPageTitle,
  closeSelf,
  sumIfMeta,
  contentScriptOnly,
  throws,
  notRegistered,
  getSelf,
} from "./api";

async function init() {
  const tab = await browser.tabs.create({
    url: "https://iframe-test-page.vercel.app/",
  });

  // Give the tabs time to load
  // TODO: This should be handled by webext-messenger itself
  //  https://github.com/pixiebrix/webext-messenger/issues/11
  await new Promise((resolve) => {
    setTimeout(resolve, 700);
  });

  const target: Target = { tab: tab.id!, frame: 0 };

  test("send message and get response", async (t) => {
    const title = await getPageTitle(target);
    t.equal(title, "Parent");
  });

  test("support parameters", async (t) => {
    await setPageTitle(target, "New Parent");
    const title = await getPageTitle(target);
    t.equal(title, "New Parent");
  });

  test("should receive information from the caller", async (t) => {
    t.equal(await sumIfMeta(target, 1, 2, 3, 4), 10);
  });

  test("handler must be executed in the content script", async (t) => {
    t.equal(await contentScriptOnly(target), true);
  });

  test("should receive error from a background handler", async (t) => {
    try {
      await throws(target);
      t.fail("throws() should have thrown but did not");
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        t.fail("The error is not an instance of Error");
        return;
      }

      if (!error.stack) {
        t.fail("The error has no stack");
        return;
      }

      t.equal(error.message, "This my error");
      t.true(
        error.stack.includes("/contentscript/registration.js"),
        "The stacktrace must come from the content script"
      );
      t.true(
        // Chrome format || Firefox format
        error.stack.includes("at Object.throws") ||
          error.stack.includes("throws@moz-"),
        "The stacktrace must include the original name of the method"
      );
    }
  });

  test("should receive error from the content script if it’s not registered", async (t) => {
    try {
      await notRegistered(target);
      t.fail("notRegistered() should have thrown but did not");
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        t.fail("The error is not an instance of Error");
        return;
      }

      t.equal(error.message, "No handler registered for notRegistered");
    }
  });

  test("should receive echo", async (t) => {
    const self = await getSelf(target);
    t.true(self instanceof Object);
    t.equals(self.id, chrome.runtime.id);
    // Chrome (the types are just for firefox) || Firefox
    t.true((self as any).origin === "null" || self.url === location.href);
  });

  test("should be able to close the tab from the content script", async (t) => {
    await closeSelf(target);
    try {
      t.notOk(await browser.tabs.get(target.tab), "The tab should not be open");
    } catch {
      t.pass("The tab was closed");
    }
  });
}

void init();
