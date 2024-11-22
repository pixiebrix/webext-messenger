import test from "tape";
import {
    getLocation,
    addFrame,
    getTrace,
} from "./api.js";
import { senderIsCurrentPage } from "../helpers.js";

test("should get a value from the offscreen document", async (t) => {
  t.equal(await getLocation(), chrome.runtime.getURL( "offscreen.html"));
});

test("notification should return undefined", async (t) => {
  // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- Testing for this specifically
  t.equals(addFrame(), undefined);
});

test("should receive trace", async (t) => {
  const trace = await getTrace();
  t.true(Array.isArray(trace));

  const originalSender = trace[0];


  senderIsCurrentPage(
    t,
    originalSender,
    "Messages should mention the current page in trace[0]"
  );

  t.equal(trace.length, 1, "The offscreen page can and should only be messaged directly");
});
