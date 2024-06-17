import { describe, test, assert } from "vitest";
import { once } from "./shared.js";

describe("once", () => {
  test("should call the function only once when callAgainCallBack is not provided", () => {
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

  test("should call the function again the next time when callAgainCallBack returns true", () => {
    let callCount = 0;
    const callback = () => {
      callCount++;
      return callCount;
    };

    let condition = true;
    const onceCallback = once(callback, { callAgainCallBack: () => condition });

    const firstCall = onceCallback();
    const secondCall = onceCallback();
    condition = false;
    const thirdCall = onceCallback();

    // Subsequent calls will not be made again after `once` executes the function with `callAgainCallBack` returning false
    condition = true;
    const fourthCall = onceCallback();
    const fifthCall = onceCallback();

    assert(callCount === 3, "Callback was not called again");
    assert(firstCall === 1, "First call did not return expected value");
    assert(secondCall === 2, "Second call did not return expected value");
    assert(thirdCall === 3, "Third call did not return expected value");
    assert(fourthCall === 3, "Fourth call did not return expected value");
    assert(fifthCall === 3, "Fifth call did not return expected value");
  });
});
