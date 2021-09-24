import browser from "webextension-polyfill";
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

async function delay(timeout: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

function runOnTarget(target: Target, expectedTitle: string) {
  test(expectedTitle + ": send message and get response", async (t) => {
    const title = await getPageTitle(target);
    t.equal(title, expectedTitle);
  });

  test(expectedTitle + ": support parameters", async (t) => {
    await setPageTitle(target, "New Title");
    const title = await getPageTitle(target);
    t.equal(title, "New Title");
  });

  test(
    expectedTitle + ": should receive information from the caller",
    async (t) => {
      t.equal(await sumIfMeta(target, 1, 2, 3, 4), 10);
    }
  );

  test(
    expectedTitle + ": handler must be executed in the content script",
    async (t) => {
      t.equal(await contentScriptOnly(target), true);
    }
  );

  test(
    expectedTitle + ": should receive error from a background handler",
    async (t) => {
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
    }
  );

  test(
    expectedTitle +
      ": should receive error from the content script if it’s not registered",
    async (t) => {
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
    }
  );

  test(expectedTitle + ": should receive echo", async (t) => {
    const self = await getSelf(target);
    t.true(self instanceof Object);
    t.equals(self.id, chrome.runtime.id);
    // Chrome (the types are just for Firefox) || Firefox
    t.true((self as any).origin === "null" || self.url === location.href);
  });
}

async function init() {
  const { id } = await browser.tabs.create({
    url: "https://iframe-test-page.vercel.app/",
  });

  await delay(1000); // Let frames load so we can query them for the tests
  const [parentFrame, iframe] = await browser.webNavigation.getAllFrames({
    tabId: id!,
  });

  // All `test` calls must be done synchronously, or else the runner assumes they're done
  runOnTarget({ tabId: id!, frameId: parentFrame!.frameId }, "Parent");
  runOnTarget({ tabId: id!, frameId: iframe!.frameId }, "Child");

  test("should throw the right error when `registerMethod` was never called", async (t) => {
    const tab = await browser.tabs.create({
      url: "https://text.npr.org/",
    });
    try {
      await getPageTitle({ tabId: tab.id! });
      t.fail("getPageTitle() should have thrown but did not");
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        t.fail("The error is not an instance of Error");
        return;
      }

      t.equal(error.message, "No handlers registered in receiving end");

      await browser.tabs.remove(tab.id!);
    }
  });

  test("should be able to close the tab from the content script", async (t) => {
    await closeSelf({ tabId: id!, frameId: parentFrame!.frameId });
    try {
      // Since the tab was closed, this is expected to throw
      t.notOk(await browser.tabs.get(id!), "The tab should not be open");
    } catch {
      t.pass("The tab was closed");
    }
  });

  test("retries until target is ready", async (t) => {
    const tab = await browser.tabs.create({
      url: "http://lite.cnn.com/",
    });
    const tabId = tab.id!;

    const request = getPageTitle({ tabId });
    await delay(1000); // Simulate a slow-loading tab
    await browser.tabs.executeScript(tabId, {
      file: "contentscript/registration.js",
    });

    t.equal(await request, "CNN - Breaking News, Latest News and Videos");
    await browser.tabs.remove(tabId);
  });

  test("retries until it times out", async (t) => {
    const tab = await browser.tabs.create({
      url: "http://lite.cnn.com/",
    });

    const startTime = Date.now();
    try {
      await getPageTitle({ tabId: tab.id! });
      t.fail("getPageTitle() should have thrown but did not");
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        t.fail("The error is not an instance of Error");
        return;
      }

      t.equal(
        error.message,
        "Could not establish connection. Receiving end does not exist."
      );
      const duration = Date.now() - startTime;
      t.ok(
        duration > 4000 && duration < 5000,
        `It should take between 4 and 5 seconds (took ${duration / 1000})s`
      );
    }

    await browser.tabs.remove(tab.id!);
  });
}

void init();
