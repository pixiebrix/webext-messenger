import * as test from "fresh-tape";
import {
  backgroundOnly,
  getExtensionId,
  notRegistered,
  sum,
  sumIfMeta,
  throws,
  getSelf,
} from "./background/api";

test("send message and get response", async (t) => {
  t.equal(await getExtensionId(), chrome.runtime.id);
});

test("support parameters", async (t) => {
  t.equal(await sum(1, 2, 3, 4), 10);
});

test("support parameters", async (t) => {
  t.equal(await sumIfMeta(1, 2, 3, 4), 10);
});

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

    t.equal(error.message, "This my error");
    t.true(
      error.stack!.includes("/background.js"),
      "The stacktrace must come from the background page"
    );
    t.true(
      error.stack!.includes("throws "),
      "The stacktrace must include the original name of the method"
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

    t.equal(error.message, "No handler registered for notRegistered");
  }
});

test("should receive echo", async (t) => {
  const self = await getSelf();
  t.true(self instanceof Object);
  t.equals(self.id, chrome.runtime.id);
  t.equals(self.url, location.href);
});
