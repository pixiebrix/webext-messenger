import { describe, test, assert } from "vitest";
import { once } from "./shared.js";

describe("once", () => {
  test("should call the function only once when callThroughCallback is not provided", () => {
    let callCount = 0;
    const callback = () => {
      callCount++;
      return callCount;
    };

    const onceCallback = once(callback);

    const firstCall = onceCallback();
    const secondCall = onceCallback();

    assert(callCount === 1, "Callback was called more than once");
    assert(firstCall === 1, "First call did not return expected value");
    assert(secondCall === 1, "Second call did not return expected value");
  });

  test("should call the function every time when callThroughCallback returns true", () => {
    let callCount = 0;
    const callback = () => {
      callCount++;
      return callCount;
    };

    const onceCallback = once(callback, { callThroughCallback: () => true });

    const firstCall = onceCallback();
    const secondCall = onceCallback();

    assert(callCount === 2, "Callback was not called every time");
    assert(firstCall === 1, "First call did not return expected value");
    assert(secondCall === 2, "Second call did not return expected value");
  });

  test("should not call through to the function when callThroughCallback returns false", () => {
    let callCount = 0;
    const callback = () => {
      callCount++;
      return callCount;
    };

    let condition = false;
    const onceCallback = once(callback, { callThroughCallback: () => condition });

    const firstCall = onceCallback();
    const secondCall = onceCallback();
    condition = true;
    const thirdCall = onceCallback();
    condition = false;
    const fourthCall = onceCallback();

    assert(callCount === 1, "Callback was called more than once");
    assert(firstCall === undefined, "First call did not return expected value");
    assert(secondCall === undefined, "Second call did not return expected value");
    assert(thirdCall === 1, "Third call did not return expected value");
    assert(fourthCall === 1, "Fourth call did not return expected value");
  });
});
