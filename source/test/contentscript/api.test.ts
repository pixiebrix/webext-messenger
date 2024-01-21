import test from "tape";
import { isBackground, isContentScript, isWebPage } from "webext-detect-page";
import { type PageTarget, type Sender, type Target } from "webext-messenger";
import {
  errorTabDoesntExist,
  errorTargetClosedEarly,
  getMethod,
  messenger,
} from "../../sender.js";
import {
  expectRejection,
  sleep,
  trackSettleTime,
  expectDuration,
} from "../helpers.js";
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
import { MessengerError } from "../../shared.js";

const extensionUrl = new URL(chrome.runtime.getURL(""));

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
    sender?.origin === extensionUrl.origin || // Chrome
      sender?.origin === "null" || // Chrome, old
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
      ": should receive error from the target if it’s not registered",
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
    const directSender = trace.at(-1);

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

async function testEveryTarget() {
  const { tabId, parentFrame, iframe } = await createTargets();

  // All `test` calls must be done synchronously, or else the runner assumes they're done
  runOnTarget({ tabId, frameId: parentFrame }, "Parent");
  runOnTarget({ tabId, frameId: iframe }, "Child");
  runOnTarget({ tabId, page: "/iframe.html" }, "Extension frame");

  test("should be able to close the tab from the content script", async (t) => {
    await closeSelf({ tabId, frameId: parentFrame });
    try {
      // Since the tab was closed, this is expected to throw
      t.notOk(await browser.tabs.get(tabId), "The tab should not be open");
    } catch {
      t.pass("The tab was closed");
    }
  });
}

function additionalTests() {
  test("should throw the right error when `registerMethod` was never called", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/Unrelated-CS-on-this-page"
    );

    await expectRejection(
      t,
      getPageTitle({ tabId }),
      new Error(
        `Messenger was not available in the target ${JSON.stringify({
          tabId,
        })} for getPageTitle`
      )
    );

    await expectRejection(
      t,
      contentScriptContext.sleep({ tabId }, 100),
      new Error(
        "Conflict: The message sleep was handled by a third-party listener"
      )
    );

    await closeTab(tabId);
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
    const request = getPageTitle({ tabId: 69_420 });
    const durationPromise = trackSettleTime(request);

    await expectRejection(t, request, new Error(errorTabDoesntExist));

    expectDuration(t, await durationPromise, 0, 100);
  });

  test("stops trying immediately if specific tab ID doesn't exist, even if targeting a named target", async (t) => {
    const target = { tabId: 69_420, page: "/void.html" };
    const request = getPageTitle(target);
    const durationPromise = trackSettleTime(request);

    if (isContentScript()) {
      // CS-to-named-target can message it directly, but can't query the tab and quit early
      await expectRejection(
        t,
        request,
        new Error(
          `The target ${JSON.stringify(target)} for getPageTitle was not found`
        )
      );
      expectDuration(t, await durationPromise, 4000, 5000);
    } else {
      await expectRejection(t, request, new Error(errorTabDoesntExist));
      expectDuration(t, await durationPromise, 0, 100);
    }
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

    expectDuration(t, await durationPromise, tabClosureTimeout);
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
      new MessengerError(
        `The target ${JSON.stringify({ tabId })} for getPageTitle was not found`
      )
    );

    expectDuration(t, await durationPromise, 4000, 5000);

    await closeTab(tabId);
  });

  test("does not retry if specifically asked not to", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/No-static-content-scripts"
    );

    const request = messenger("getPageTitle", { retry: false }, { tabId });
    const durationPromise = trackSettleTime(request);

    await expectRejection(
      t,
      request,
      new MessengerError(
        `The target ${JSON.stringify({ tabId })} for getPageTitle was not found`
      )
    );

    expectDuration(t, await durationPromise, 0);

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

    expectDuration(t, await durationPromise, 4000, 5000);

    await closeTab(tabId);
  });

  test("throws the right error after retrying if a named target isn't found", async (t) => {
    const target = { page: "/wasnt-me.html" };
    const request = getPageTitle(target);
    const durationPromise = trackSettleTime(request);

    await expectRejection(
      t,
      request,
      new Error(
        `The target ${JSON.stringify(target)} for getPageTitle was not found`
      )
    );

    expectDuration(t, await durationPromise, 4000, 5000);
  });

  test("throws the right error after retrying if a named target with tabId isn't found", async (t) => {
    const tabId = await openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/No-frames-on-the-page"
    );
    const target = { tabId, page: "/memes.html" };
    const request = getPageTitle(target);
    const durationPromise = trackSettleTime(request);

    await expectRejection(
      t,
      request,
      new Error(
        `The target ${JSON.stringify(target)} for getPageTitle was not found`
      )
    );

    expectDuration(t, await durationPromise, 4000, 5000);

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

  test("should support target promises in methods with static targets", async (t) => {
    const tabIdPromise = openTab(
      "https://fregante.github.io/pixiebrix-testing-ground/Will-receive-CS-calls/Promised-target"
    );
    const targetPromise = tabIdPromise.then((tabId) => ({ tabId }));

    const request = getMethod("getPageTitle", targetPromise);
    t.equal(await request(), "Promised target");

    await closeTab(await tabIdPromise);
  });
}

void testEveryTarget();
additionalTests();
