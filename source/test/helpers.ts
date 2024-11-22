import type test from "tape";
import { type Sender } from "webext-messenger";


export async function expectRejection(
  t: test.Test,
  promise: Promise<unknown>,
  expectedError: Error
): Promise<void> {
  try {
    await promise;
    t.fail("Should have thrown but did not");
  } catch (error: unknown) {
    if (!(error instanceof expectedError.constructor)) {
      t.fail(
        "The error is not an instance of " + expectedError.constructor.name
      );
    }

    t.equal((error as Error).message, expectedError.message);
  }
}

export async function sleep(milliseconds: number): Promise<number> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Helper to ensure we're tracking the specific promise’s duration without risking to track anything else */
export async function trackSettleTime(
  promise: Promise<unknown>
): Promise<number> {
  const startTime = performance.now();
  try {
    await promise;
  } catch {}

  return performance.now() - startTime;
}

export function expectDuration(
  t: test.Test,
  actualDuration: number,
  expectedDuration: number,
  maximumDuration?: number
) {
  console.log({ actualDuration, expectedDuration, maximumDuration });
  if (maximumDuration) {
    t.ok(
      actualDuration >= expectedDuration && actualDuration <= maximumDuration,
      expectedDuration > 0
        ? `It should take between ${expectedDuration / 1000} and ${
            maximumDuration / 1000
          } seconds (took ${actualDuration / 1000}s)`
        : `It should take less than ${maximumDuration / 1000} seconds (took ${
            actualDuration / 1000
          }s)`
    );
  } else {
    t.ok(
      actualDuration > expectedDuration - 100 &&
        actualDuration < expectedDuration + 100,
      `It should take about ${expectedDuration / 1000}s (took ${
        actualDuration / 1000
      }s)`
    );
  }
}

const extensionUrl = new URL(chrome.runtime.getURL(""));

export function senderIsCurrentPage(
  t: test.Test,
  sender: Sender | undefined,
  message: string
) {
  t.equal(sender?.url, location.href, message);
}

export function senderisBackground(
  t: test.Test,
  sender: Sender | undefined,
  message: string
) {
  /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- It's an OR on falsy values */
  t.true(
    sender?.origin === extensionUrl.origin || // Chrome
      sender?.origin === "null" || // Chrome, old
      sender?.url?.includes("/background.") ||
      sender?.url?.endsWith("/_generated_background_page.html"), // Firefox
    message
  );
}
