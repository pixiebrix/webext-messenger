import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vitest";
import { isBackground, isExtensionContext } from "webext-detect";
import {
  errorTabDoesntExist,
  errorTabWasDiscarded,
  errorTargetClosedEarly,
  getMethod,
  getNotifier,
  messenger,
} from "./sender.js";
import { handlers } from "./handlers.js";
import { events } from "./events.js";
import { ExtensionNotFoundError, MessengerError } from "./shared.js";
import {
  type MessengerMessage,
  type MessengerMeta,
  type Method,
} from "./types.js";

vi.mock("webext-detect");

declare global {
  interface MessengerMethods {
    /** Stand-in method, only ever registered/targeted by this file. */
    senderTestMethod: (
      this: MessengerMeta,
      ...args: unknown[]
    ) => Promise<unknown>;
  }
}

// The verbatim strings the browser throws. `sender.ts` matches on them to decide
// whether an error is retryable, so a change in either place must break a test.
const browserErrorNoReceiver =
  "Could not establish connection. Receiving end does not exist.";
const browserErrorClosedEarly =
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";

/** `sender.ts` only unwraps responses carrying this marker; anything else is a third-party reply. */
function messengerReply(value: unknown) {
  return { __webextMessenger: true, value };
}

function messengerErrorReply(name: string, message: string) {
  return { __webextMessenger: true, error: { name, message } };
}

type SendMessageMock = Mock<(...args: unknown[]) => Promise<unknown>>;
type TabsGetMock = Mock<(tabId: number) => Promise<{ discarded: boolean }>>;

type ChromeStub = {
  runtime: { id: string | undefined; sendMessage: SendMessageMock };
  tabs?: { sendMessage: SendMessageMock; get: TabsGetMock };
};

/**
 * @param tabs Contexts without the tabs API (content scripts, offscreen documents)
 * take a different route through `messenger()`, so this must be switchable.
 * @param invalidated Drops `runtime.id`, which is how the browser signals that the
 * extension was reloaded out from under this context.
 */
function stubChrome({ tabs = true, invalidated = false } = {}): ChromeStub {
  const chromeStub: ChromeStub = {
    runtime: {
      id: invalidated ? undefined : "this-extension-id",
      sendMessage: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  };

  if (tabs) {
    chromeStub.tabs = {
      sendMessage: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
      get: vi
        .fn<(tabId: number) => Promise<{ discarded: boolean }>>()
        .mockResolvedValue({ discarded: false }),
    };
  }

  vi.stubGlobal("chrome", chromeStub);
  return chromeStub;
}

/** The message envelope is always the last argument of a `runtime.sendMessage` call. */
function sentEnvelope(mock: SendMessageMock, index = 0): MessengerMessage {
  return mock.mock.calls[index]!.at(-1) as MessengerMessage;
}

const eventCleanups: Array<() => void> = [];

function trackEvent(name: string): Mock {
  const listener = vi.fn();
  events.addEventListener(name, listener);
  eventCleanups.push(() => {
    events.removeEventListener(name, listener);
  });
  return listener;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  handlers.clear();
  for (const cleanup of eventCleanups.splice(0)) {
    cleanup();
  }
});

describe("messenger() routing", () => {
  test("sends to another extension via runtime.sendMessage(extensionId, message)", async () => {
    const chromeStub = stubChrome();
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply(3));

    await expect(
      messenger("senderTestMethod", {}, { extensionId: "other-extension" }, 1),
    ).resolves.toBe(3);

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledWith(
      "other-extension",
      expect.objectContaining({
        __webextMessenger: true,
        type: "senderTestMethod",
        args: [1],
        target: { extensionId: "other-extension" },
      }),
    );
  });

  test("throws synchronously when the browser cannot message other extensions", () => {
    vi.stubGlobal("chrome", {});

    expect(() => {
      void messenger(
        "senderTestMethod",
        {},
        { extensionId: "other-extension" },
        1,
      );
    }).toThrow(ExtensionNotFoundError);
  });

  test("invokes the local handler when the background page targets itself", async () => {
    const chromeStub = stubChrome();
    vi.mocked(isBackground).mockReturnValue(true);
    const handler = vi.fn().mockResolvedValue(42);
    handlers.set("senderTestMethod", handler as unknown as Method);

    await expect(
      messenger("senderTestMethod", {}, { page: "background" }, 1, 2),
    ).resolves.toBe(42);

    expect(handler).toHaveBeenCalledWith(1, 2);
    expect(chromeStub.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test("throws when the background page targets itself without a registered handler", () => {
    stubChrome();
    vi.mocked(isBackground).mockReturnValue(true);

    expect(() => {
      void messenger("senderTestMethod", {}, { page: "background" }, 1);
    }).toThrow("No handler registered locally for senderTestMethod");
  });

  test("sends to an extension page via runtime.sendMessage(message)", async () => {
    const chromeStub = stubChrome();
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));

    await expect(
      messenger("senderTestMethod", {}, { page: "/options.html" }, 1),
    ).resolves.toBe("ok");

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
    // A single argument, otherwise the browser reads it as an extension id
    expect(chromeStub.runtime.sendMessage.mock.calls[0]).toHaveLength(1);
  });

  test("routes tab targets through the runtime when the context has no tabs API", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));

    await expect(
      messenger("senderTestMethod", {}, { tabId: 1, frameId: 3 }, 1),
    ).resolves.toBe("ok");

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  test.each([
    ["defaults to the top frame", { tabId: 1 }, { frameId: 0 }],
    ["forwards an explicit frame", { tabId: 1, frameId: 5 }, { frameId: 5 }],
    [
      "drops frameId to reach every frame",
      { tabId: 1, frameId: "allFrames" as const },
      {},
    ],
  ])("sends to a tab and %s", async (_name, target, expectedOptions) => {
    const chromeStub = stubChrome();
    chromeStub.tabs!.sendMessage.mockResolvedValue(messengerReply("ok"));

    await expect(messenger("senderTestMethod", {}, target, 1)).resolves.toBe(
      "ok",
    );

    expect(chromeStub.tabs!.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: "senderTestMethod" }),
      expectedOptions,
    );
  });

  test("stamps every message with the marker and an increasing seq", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));

    await messenger("senderTestMethod", {}, { page: "/options.html" }, 1);
    await messenger("senderTestMethod", {}, { page: "/options.html" }, 2);

    const first = sentEnvelope(chromeStub.runtime.sendMessage, 0);
    const second = sentEnvelope(chromeStub.runtime.sendMessage, 1);
    expect(first.__webextMessenger).toBe(true);
    expect(second.options!.seq).toBe(first.options!.seq! + 1);
  });
});

/**
 * Regression guard for #409: 0.35.0 hoisted a `compareTargets()` short-circuit onto
 * the send path, which threw `TypeError: Invalid URL` in opaque-origin frames and
 * mis-routed same-tab messages to the sending frame. Reverted in #410.
 */
describe("sending from a content script (regression: #409)", () => {
  beforeEach(() => {
    // A sandboxed `about:srcdoc` frame has an opaque origin, so `location.origin`
    // is the literal string "null" and `new URL(page, location.origin)` throws.
    vi.stubGlobal("location", {
      origin: "null",
      protocol: "about:",
      pathname: "srcdoc",
      search: "",
    });
  });

  test("reaches the runtime from an opaque-origin frame", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));
    const localHandler = vi.fn();
    handlers.set("senderTestMethod", localHandler as unknown as Method);

    // `{page: "any"}` is the target used by `storeTabData()`, the first message
    // every content script sends; in 0.35.0 it threw before routing.
    await expect(
      messenger("senderTestMethod", {}, { page: "any" }, 1),
    ).resolves.toBe("ok");

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(localHandler).not.toHaveBeenCalled();
  });

  test("does not handle a same-tab target locally", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));
    const localHandler = vi.fn();
    handlers.set("senderTestMethod", localHandler as unknown as Method);

    // A frame sending to `{tabId}` means the *top* frame, never itself.
    await expect(
      messenger("senderTestMethod", {}, { tabId: 1 }, 1),
    ).resolves.toBe("ok");

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(localHandler).not.toHaveBeenCalled();
  });
});

describe("messenger() responses", () => {
  test("returns the value from a messenger reply", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply({ a: 1 }));

    await expect(
      messenger("senderTestMethod", {}, { page: "/options.html" }, 1),
    ).resolves.toEqual({ a: 1 });
  });

  test("rethrows a deserialized error from a messenger reply", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(
      messengerErrorReply("TypeError", "Handler exploded"),
    );

    await expect(
      messenger("senderTestMethod", {}, { page: "/options.html" }, 1),
    ).rejects.toThrow("Handler exploded");
    // A genuine error from the target must not be retried
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  test("reports a missing page target when nobody answers", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(undefined);

    await expect(
      messenger(
        "senderTestMethod",
        { retry: false },
        { page: "/options.html" },
        1,
      ),
    ).rejects.toThrow(
      'The target {"page":"/options.html"} for senderTestMethod was not found',
    );
  });

  test("reports a messenger-less tab when nobody answers", async () => {
    const chromeStub = stubChrome();
    chromeStub.tabs!.sendMessage.mockResolvedValue(undefined);

    await expect(
      messenger("senderTestMethod", { retry: false }, { tabId: 1 }, 1),
    ).rejects.toThrow("Messenger was not available in the target");
  });

  test("reports a conflict when a third-party listener answers", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue("not a messenger reply");

    await expect(
      messenger(
        "senderTestMethod",
        { retry: false },
        { page: "/options.html" },
        1,
      ),
    ).rejects.toThrow(
      "Conflict: The message senderTestMethod was handled by a third-party listener",
    );
  });
});

describe("retry behaviour", () => {
  test("retries until the receiving end exists", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage
      .mockRejectedValueOnce(new Error(browserErrorNoReceiver))
      .mockResolvedValueOnce(messengerReply("ok"));

    const promise = messenger(
      "senderTestMethod",
      {},
      { page: "/options.html" },
      1,
    );
    const assertion = expect(promise).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(500);
    await assertion;

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("retries a MessengerError, which means the target is still booting", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage
      .mockResolvedValueOnce(
        messengerErrorReply("MessengerError", "No handlers registered in x"),
      )
      .mockResolvedValueOnce(messengerReply("ok"));

    const promise = messenger(
      "senderTestMethod",
      {},
      { page: "/options.html" },
      1,
    );
    const assertion = expect(promise).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(500);
    await assertion;

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("makes a single attempt when retry is disabled", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockRejectedValue(
      new Error(browserErrorNoReceiver),
    );

    await expect(
      messenger(
        "senderTestMethod",
        { retry: false },
        { page: "/options.html" },
        1,
      ),
    ).rejects.toThrow(
      'The target {"page":"/options.html"} for senderTestMethod was not found',
    );

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  test("does not retry once the target has closed early", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockRejectedValue(
      new Error(browserErrorClosedEarly),
    );

    await expect(
      messenger("senderTestMethod", {}, { page: "/options.html" }, 1),
    ).rejects.toThrow(errorTargetClosedEarly);

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  test("does not retry a missing external extension", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockRejectedValue(
      new Error(browserErrorNoReceiver),
    );

    await expect(
      messenger("senderTestMethod", {}, { extensionId: "other-extension" }, 1),
    ).rejects.toThrow(ExtensionNotFoundError);

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  test("stops as soon as the extension context is invalidated", async () => {
    const chromeStub = stubChrome({ tabs: false, invalidated: true });
    vi.mocked(isExtensionContext).mockReturnValue(true);
    chromeStub.runtime.sendMessage.mockRejectedValue(
      new Error(browserErrorNoReceiver),
    );

    await expect(
      messenger("senderTestMethod", {}, { page: "/options.html" }, 1),
    ).rejects.toThrow("Extension context invalidated.");

    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  test("stops retrying when the target tab is gone", async () => {
    const chromeStub = stubChrome();
    chromeStub.tabs!.sendMessage.mockRejectedValue(
      new Error(browserErrorNoReceiver),
    );
    chromeStub.tabs!.get.mockRejectedValue(new Error("No tab with id: 1."));

    await expect(
      messenger("senderTestMethod", {}, { tabId: 1 }, 1),
    ).rejects.toThrow(errorTabDoesntExist);

    expect(chromeStub.tabs!.sendMessage).toHaveBeenCalledOnce();
  });

  test("stops retrying when the target tab was discarded", async () => {
    const chromeStub = stubChrome();
    chromeStub.tabs!.sendMessage.mockRejectedValue(
      new Error(browserErrorNoReceiver),
    );
    chromeStub.tabs!.get.mockResolvedValue({ discarded: true });

    await expect(
      messenger("senderTestMethod", {}, { tabId: 1 }, 1),
    ).rejects.toThrow(errorTabWasDiscarded);

    expect(chromeStub.tabs!.sendMessage).toHaveBeenCalledOnce();
  });

  test("gives up after the retry window and announces attempts-exhausted", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockRejectedValue(
      new Error("No handlers registered in background"),
    );
    const failedAttempt = trackEvent("failed-attempt");
    const attemptsExhausted = trackEvent("attempts-exhausted");

    const promise = messenger(
      "senderTestMethod",
      {},
      { page: "/options.html" },
      1,
    );
    const assertion = expect(promise).rejects.toThrow(
      "No handlers registered in background",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(attemptsExhausted).toHaveBeenCalledOnce();
    expect(failedAttempt.mock.calls.length).toBe(
      chromeStub.runtime.sendMessage.mock.calls.length,
    );
    expect(chromeStub.runtime.sendMessage.mock.calls.length).toBeGreaterThan(1);
  });

  test("backs off exponentially rather than hammering the target", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockRejectedValue(
      new Error(browserErrorNoReceiver),
    );

    const promise = messenger(
      "senderTestMethod",
      {},
      { page: "/options.html" },
      1,
    );
    const assertion = expect(promise).rejects.toThrow(MessengerError);

    await vi.advanceTimersByTimeAsync(100);
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledTimes(2);
    // The second wait is longer than the first, so no third attempt yet
    await vi.advanceTimersByTimeAsync(100);
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    // The safety cap in `manageMessage` must never be the reason we stopped
    expect(chromeStub.runtime.sendMessage.mock.calls.length).toBeLessThan(15);
  });
});

describe("notifications", () => {
  test("return undefined, send once, and swallow errors", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockRejectedValue(
      new Error(browserErrorNoReceiver),
    );

    // Re-typed to capture the runtime value: notifications are typed `void`, and
    // callers rely on nothing awaitable coming back.
    const send = messenger as unknown as (...args: unknown[]) => unknown;
    const result = send(
      "senderTestMethod",
      { isNotification: true },
      { page: "/options.html" },
      1,
    );

    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });
});

describe("getMethod() and getNotifier()", () => {
  test("getMethod binds a fixed target", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));

    const method = getMethod("senderTestMethod", { page: "/options.html" });
    await expect(method(1, 2)).resolves.toBe("ok");

    expect(sentEnvelope(chromeStub.runtime.sendMessage)).toMatchObject({
      args: [1, 2],
      target: { page: "/options.html" },
    });
  });

  test("getMethod awaits a promised target", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));

    const method = getMethod(
      "senderTestMethod",
      Promise.resolve({ tabId: 1, frameId: 2 }),
    );
    await expect(method(1)).resolves.toBe("ok");

    expect(sentEnvelope(chromeStub.runtime.sendMessage)).toMatchObject({
      target: { tabId: 1, frameId: 2 },
    });
  });

  test("getMethod without a target takes it as the first argument", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockResolvedValue(messengerReply("ok"));

    const method = getMethod("senderTestMethod");
    await expect(method({ page: "/options.html" }, 1)).resolves.toBe("ok");

    expect(sentEnvelope(chromeStub.runtime.sendMessage)).toMatchObject({
      args: [1],
      target: { page: "/options.html" },
    });
  });

  test("getNotifier returns void and never rejects", async () => {
    const chromeStub = stubChrome({ tabs: false });
    chromeStub.runtime.sendMessage.mockRejectedValue(new Error("boom"));

    const notify = getNotifier("senderTestMethod", { page: "/options.html" });
    const result = (notify as unknown as (...args: unknown[]) => unknown)(1);

    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledOnce();
  });
});
