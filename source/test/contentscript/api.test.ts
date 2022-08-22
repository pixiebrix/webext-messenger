import test from "tape";
import { isBackground, isContentScript, isWebPage } from "webext-detect-page";
import { PageTarget, Sender, Target } from "../../index.js";
import { errorTabDoesntExist, errorTargetClosedEarly } from "../../sender.js";
import { expectRejection, sleep, trackSettleTime } from "../helpers.js";
import * as backgroundContext from "../background/api.js";
import * as localContext from "../background/testingApi.js";
import * as contentScriptContext from "./api.js";
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
} from "./api.js";

function senderIsCurrentPage(
  t: test.Test,
  sender: Sender | undefined,
  message: string
) {
  t.equal(sender?.url, location.href, message);
}

function senderisBackground(
  t: test.Test,
  sender: Sender | undefined,
  message: string
) {
  t.true(
    sender?.origin === "null" || // Chrome
      sender!.url?.endsWith("/_generated_background_page.html"), // Firefox
    message
  );
}

const { openTab, createTargets, ensureScripts, closeTab } = isBackground()
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
          error.stack.includes("/contentscript/registration.js") ||
            error.stack.includes("/iframe."), // Parcel 2.6+ rebundles the same file under a different name
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
      await expectRejection(
        t,
        notRegistered(target),
        new Error(
          `No handler registered for notRegistered in ${
            "page" in target ? "extension" : "contentScript"
          }`
        )
      );
    }
  );

  test(expectedTitle + ": should receive trace", async (t) => {
    const trace = await getTrace(target);
    t.true(Array.isArray(trace));
    const originalSender = trace[0];
    const directSender = trace[trace.length - 1];

    if (isContentScript() || !isBackground()) {
      senderIsCurrentPage(
        t,
        originalSender,
        "Messages should mention the current page in trace[0]"
      );
    } else {
      senderisBackground(
        t,
        directSender,
        "Messages should mention the current page (background) in trace[0]"
      );
    }

    if (!("page" in target && isContentScript())) {
      senderisBackground(
        t,
        directSender,
        "Messages originated in content scripts or background pages must come directly from the background page"
      );
    }

    if (!isWebPage()) {
      t.equal(
        trace.length,
        1,
        "Messages originated in extension pages don’t need to be forwarded"
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

    await expectRejection(
      t,
      getPageTitle({ tabId }),
      new Error("No handler registered for getPageTitle in the receiving end")
    );

    await closeTab(tabId);
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

  test("stops trying immediately if specific tab ID doesn't exist", async (t) => {
    const request = getPageTitle({ tabId });
    const durationPromise = trackSettleTime(request);

    await expectRejection(t, request, new Error(errorTabDoesntExist));

    const duration = await durationPromise;
    t.ok(
      duration < 100,
      `It should take less than 100 ms (took ${duration}ms)`
    );
  });

  test("stops trying immediately if tab is closed before the handler responds", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/Will-receive-CS-calls/Will-close-too-soon"
    );

    const naturalResolutionTimeout = 5000;
    const tabClosureTimeout = 2000;

    const request = contentScriptContext.sleep(
      { tabId },
      naturalResolutionTimeout
    );
    const durationPromise = trackSettleTime(request);

    await sleep(tabClosureTimeout);
    await closeTab(tabId);

    await expectRejection(t, request, new Error(errorTargetClosedEarly));

    const duration = await durationPromise;
    t.ok(
      duration > tabClosureTimeout - 100 && duration < tabClosureTimeout + 100,
      `It should take about ${tabClosureTimeout / 1000}s (took ${
        duration / 1000
      }s)`
    );
  });

  test("retries until it times out", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/No-static-content-scripts"
    );

    const request = getPageTitle({ tabId });
    const durationPromise = trackSettleTime(request);

    await expectRejection(
      t,
      request,
      new Error("Could not establish connection. Receiving end does not exist.")
    );

    const duration = await durationPromise;
    t.ok(
      duration > 4000 && duration < 5000,
      `It should take between 4 and 5 seconds (took ${duration / 1000}s)`
    );

    await closeTab(tabId);
  });

  test("retries until it times out even if webext-messenger was loaded (but nothing was registered)", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/webext-messenger-was-imported-but-not-executed"
    );

    const request = getPageTitle({ tabId });
    const durationPromise = trackSettleTime(request);

    await expectRejection(
      t,
      request,
      new Error("No handlers registered in contentScript")
    );

    const duration = await durationPromise;
    t.ok(
      duration > 4000 && duration < 5000,
      `It should take between 4 and 5 seconds (took ${duration / 1000}s)`
    );

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
