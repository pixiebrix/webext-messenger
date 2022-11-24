import type test from "tape";

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
  const startTime = Date.now();
  try {
    await promise;
  } catch {}

  return Date.now() - startTime;
}
