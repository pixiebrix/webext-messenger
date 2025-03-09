/* eslint-disable unicorn/no-await-expression-member */
import test from "tape";
import { isExtensionContext } from "webext-detect";
import {
  getPlatformInfo,
  getSelfExternal,
  sum,
  notRegisteredNotification,
} from "./api.js";
import { MessengerError } from "webext-messenger/shared.js";

if (isExtensionContext()) {
  throw new Error("This test must be run in an external page");
}

const extensionId = document.querySelector<HTMLInputElement>(
  '[name="extensionId"]',
)!.value;

test("send message and get response", async (t) => {
  const info = await getPlatformInfo({ extensionId });
  t.true(info instanceof Object);
  t.equals(typeof info.os, "string");
  t.equals(typeof info.arch, "string");
});

test("should receive echo", async (t) => {
  const self = await getSelfExternal({ extensionId });
  t.true(self.approvedForExternalUse instanceof Object);
  t.true(typeof self.approvedForExternalUse.tab?.id === "number");
  t.equals(self.approvedForExternalUse.url, location.href);
});

test("should throw if the API does not allow external use", async (t) => {
  try {
    await sum({ extensionId }, 1, 2, 3, 4);
    t.fail("throws() should have thrown but did not");
  } catch (error: unknown) {
    t.true(error instanceof MessengerError);
    t.equals(
      (error as any).message,
      "The sum handler is registered in background for internal use only",
    );
  }
});

test("notification should return undefined", async (t) => {
  // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- Testing for this specifically
  t.equals(notRegisteredNotification({ extensionId }), undefined);
});

test("throw when extension is not installed", async (t) => {
  try {
    await getPlatformInfo({ extensionId: "aflddffcidoamfabkogfeimijgneaaha" });
    t.fail("throws() should have thrown but did not");
  } catch (error: unknown) {
    t.true(error instanceof MessengerError);
    t.equals(
      (error as any).message,
      "Extension aflddffcidoamfabkogfeimijgneaaha is not installed or externally connectable",
    );
  }
});
