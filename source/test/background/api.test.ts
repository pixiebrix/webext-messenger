/* eslint-disable unicorn/no-await-expression-member */
import test from "tape";
import { isBackground } from "webext-detect";
import { getThisFrame } from "webext-messenger/thisTarget.js";
import { expectDuration, trackSettleTime } from "../helpers.js";
import {
  backgroundOnly,
  getExtensionId,
  notRegistered,
  sum,
  sumIfMeta,
  throws,
  getSelf,
} from "./api.js";

test("send message and get response", async (t) => {
  t.equal(await getExtensionId(), chrome.runtime.id);
});

test("support parameters", async (t) => {
  t.equal(await sum(1, 2, 3, 4), 10);
});

if (isBackground()) {
  test("the messenger should be missing in local calls", async (t) => {
    try {
      await sumIfMeta(1, 2, 3, 4);
      t.fail("throws() should have thrown but did not");
    } catch (error: unknown) {
      t.true(error instanceof Error);
      t.equals((error as any).message, "Wrong sender");
    }
  });
} else {
  test("should receive information from the caller", async (t) => {
    t.equal(await sumIfMeta(1, 2, 3, 4), 10);
  });
}

test("handler must be executed in the background script", async (t) => {
  t.equal(await backgroundOnly(), true);
});

test("should receive error from a background handler", async (t) => {
  try {
    await throws();
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
      error.stack.includes("/background."),
      "The stacktrace must come from the background page",
    );
    t.true(
      // Chrome format || Firefox format
      error.stack.includes("at Object.throws") ||
        error.stack.includes("throws@moz-"),
      "The stacktrace must include the original name of the method",
    );
  }
});

test("should receive error from the background if it’s not registered", async (t) => {
  try {
    await notRegistered();
    t.fail("notRegistered() should have thrown but did not");
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      t.fail("The error is not an instance of Error");
      return;
    }

    t.equal(
      error.message,
      "No handler registered for notRegistered in background",
    );
  }
});

if (isBackground()) {
  test("should not receive information about self in local calls", async (t) => {
    t.equals(await getSelf(), undefined);
  });
} else {
  test("should receive echo", async (t) => {
    const self = await getSelf();
    t.true(self instanceof Object);
    t.equals(self!.id, chrome.runtime.id);
    t.equals(self!.url, location.href);
  });

  test("getThisFrame should be correct and immediate", async (t) => {
    const localRequest = getThisFrame();
    const localRequestDuration = trackSettleTime(localRequest);
    const messengerRequest = getSelf();
    const messengerRequestDuration = trackSettleTime(messengerRequest);

    t.is((await localRequest).tabId, (await messengerRequest)!.tab!.id);
    t.is((await localRequest).frameId, (await messengerRequest)!.frameId);

    expectDuration(t, await localRequestDuration, 0, 1);
    t.true(
      (await localRequestDuration) < (await messengerRequestDuration),
      "getThisFrame should be faster than a Messenger round-trip",
    );
  });
}
