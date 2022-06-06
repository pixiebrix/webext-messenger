import test from "tape";

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
