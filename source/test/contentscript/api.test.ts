import test from "tape";
import browser from "webextension-polyfill";
import { isBackgroundPage, isContentScript } from "webext-detect-page";
import { PageTarget, Target } from "../..";
import * as backgroundContext from "../background/api";
import * as localContext from "../background/testingApi";
import {
  getPageTitle,
  setPageTitle,
  closeSelf,
  sumIfMeta,
  contentScriptOnly,
  throws,
  notRegistered,
  getTrace,
  notRegisteredNotification,
  getPageTitleNotification,
} from "./api";

const { openTab, createTargets, ensureScripts, closeTab } = isBackgroundPage()
  ? localContext
  : backgroundContext;

async function delay(timeout: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

function runOnTarget(target: Target | PageTarget, expectedTitle: string) {
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

  if (!("page" in target)) {
    test(
      expectedTitle + ": handler must be executed in the content script",
      async (t) => {
        t.equal(await contentScriptOnly(target), true);
      }
    );
  }

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

        t.equal(
          error.message,
          `No handler registered for notRegistered in ${
            "page" in target ? "extension" : "contentScript"
          }`
        );
      }
    }
  );

  test(expectedTitle + ": should receive trace", async (t) => {
    const trace = await getTrace(target);
    t.true(Array.isArray(trace));
    const originalSender = trace[0];
    const directSender = trace[trace.length - 1];

    if (!("page" in target && isContentScript())) {
      t.true(
        // TODO: `as any` because `self` is typed for Firefox only
        (directSender as any).origin === "null" || // Chrome
          directSender!.url?.endsWith("/_generated_background_page.html"), // Firefox
        "The direct sender must be the background page"
      );
    }

    if (isContentScript()) {
      t.equal(
        originalSender?.url,
        location.href,
        "The message was sent from a content script so the trace should mention it at position 0"
      );
    }
  });

  test(expectedTitle + ": notification should return undefined", async (t) => {
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- Testing for this specifically
    t.equals(getPageTitleNotification(target), undefined);
  });

  test(
    expectedTitle +
      ": notification without registered handlers should not throw",
    async (t) => {
      notRegisteredNotification(target);
      t.pass();
    }
  );
}

async function init() {
  const { tabId, parentFrame, iframe } = await createTargets();

  // All `test` calls must be done synchronously, or else the runner assumes they're done
  runOnTarget({ tabId, frameId: parentFrame }, "Parent");
  runOnTarget({ tabId, frameId: iframe }, "Child");
  runOnTarget({ tabId, page: "/iframe.html" }, "Extension frame");

  test("should throw the right error when `registerMethod` was never called", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/Unrelated-CS-on-this-page"
    );
    try {
      await getPageTitle({ tabId });
      t.fail("getPageTitle() should have thrown but did not");
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        t.fail("The error is not an instance of Error");
        return;
      }

      t.equal(
        error.message,
        "No handler registered for getPageTitle in the receiving end"
      );

      await closeTab(tabId);
    }
  });

  test("should be able to close the tab from the content script", async (t) => {
    await closeSelf({ tabId, frameId: parentFrame });
    try {
      // Since the tab was closed, this is expected to throw
      t.notOk(await browser.tabs.get(tabId), "The tab should not be open");
    } catch {
      t.pass("The tab was closed");
    }
  });

  test("retries until target is ready", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/No-static-content-scripts"
    );

    const request = getPageTitle({ tabId });
    await delay(1000); // Simulate a slow-loading tab
    await ensureScripts(tabId);

    t.equal(await request, "No static content scripts");
    await closeTab(tabId);
  });

  test("retries until it times out", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/No-static-content-scripts"
    );

    const startTime = Date.now();
    try {
      await getPageTitle({ tabId });
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
        `It should take between 4 and 5 seconds (took ${duration / 1000}s)`
      );
    }

    await closeTab(tabId);
  });

  test("notifications on non-existing targets", async (t) => {
    try {
      getPageTitleNotification({ tabId: 9001 });
    } catch (error: unknown) {
      t.fail("Should not throw");
      throw error;
    }

    t.pass();
  });

  test("notifications when `registerMethod` was never called", async () => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/No-static-content-scripts"
    );
    getPageTitleNotification({ tabId });
    await closeTab(tabId);
  });
}

void init();
