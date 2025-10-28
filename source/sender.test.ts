/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/naming-convention */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { handlers } from "./handlers.js";
import * as thisTargetModule from "./thisTarget.js";

// Declare test method type
declare global {
  interface MessengerMethods {
    testMethod: () => Promise<string>;
  }
}

// Mock dependencies
vi.mock("webext-detect", () => ({
  isBackground: vi.fn(() => false),
  isExtensionContext: vi.fn(() => true),
  isOffscreenDocument: vi.fn(() => false),
  isContentScript: vi.fn(() => true),
}));

vi.mock("./logging.js", () => ({
  log: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("./events.js", () => ({
  events: {
    dispatchEvent: vi.fn(),
  },
}));

// Mock chrome APIs - simulate content script environment (no chrome.tabs)
globalThis.chrome = {
  runtime: {
    id: "test-extension-id",
    sendMessage: vi.fn(),
  },
  // Note: chrome.tabs is undefined in content scripts
} as any;

describe("messenger with tab targets and local methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
  });

  test("should use local method when targeting same tab and frame", async () => {
    // Setup: Set thisTarget to have tabId: 1, frameId: 0
    const mockThisTarget: Partial<typeof thisTargetModule.thisTarget> = {
      tabId: 1,
      frameId: 0,
      page: "test",
    };
    vi.spyOn(thisTargetModule, "thisTarget", "get").mockReturnValue(
      mockThisTarget as typeof thisTargetModule.thisTarget,
    );

    // Register a local handler
    const mockHandler = vi.fn(async () => "local result");
    handlers.set("testMethod", mockHandler);

    // Import messenger after mocks are set up
    const { messenger } = await import("./sender.js");

    // Test: Send message to same tab and frame
    const result = await messenger("testMethod", {}, { tabId: 1, frameId: 0 });

    // Verify: Handler was called locally
    expect(mockHandler).toHaveBeenCalledOnce();
    expect(mockHandler).toHaveBeenCalledWith();
    expect(result).toBe("local result");

    // Verify: No message was sent via chrome.runtime.sendMessage
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test("should send message when targeting different tab", async () => {
    // Setup: Set thisTarget to have tabId: 1, frameId: 0
    const mockThisTarget: Partial<typeof thisTargetModule.thisTarget> = {
      tabId: 1,
      frameId: 0,
      page: "test",
    };
    vi.spyOn(thisTargetModule, "thisTarget", "get").mockReturnValue(
      mockThisTarget as typeof thisTargetModule.thisTarget,
    );

    // Register a local handler (should not be used)
    const mockHandler = vi.fn(async () => "local result");
    handlers.set("testMethod", mockHandler);

    // Mock chrome.runtime.sendMessage to return a messenger response
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      __webextMessenger: true,
      value: "remote result",
    } as any);

    // Import messenger after mocks are set up
    const { messenger } = await import("./sender.js");

    // Test: Send message to different tab
    const result = await messenger("testMethod", {}, { tabId: 2, frameId: 0 });

    // Verify: Message was sent via chrome.runtime.sendMessage
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(result).toBe("remote result");

    // Verify: Local handler was not called
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test("should send message when targeting different frame in same tab", async () => {
    // Setup: Set thisTarget to have tabId: 1, frameId: 0
    const mockThisTarget: Partial<typeof thisTargetModule.thisTarget> = {
      tabId: 1,
      frameId: 0,
      page: "test",
    };
    vi.spyOn(thisTargetModule, "thisTarget", "get").mockReturnValue(
      mockThisTarget as typeof thisTargetModule.thisTarget,
    );

    // Register a local handler (should not be used)
    const mockHandler = vi.fn(async () => "local result");
    handlers.set("testMethod", mockHandler);

    // Mock chrome.runtime.sendMessage to return a messenger response
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      __webextMessenger: true,
      value: "remote result",
    } as any);

    // Import messenger after mocks are set up
    const { messenger } = await import("./sender.js");

    // Test: Send message to different frame in same tab
    const result = await messenger("testMethod", {}, { tabId: 1, frameId: 1 });

    // Verify: Message was sent via chrome.runtime.sendMessage
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(result).toBe("remote result");

    // Verify: Local handler was not called
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test("should send message when targeting allFrames", async () => {
    // Setup: Set thisTarget to have tabId: 1, frameId: 0
    const mockThisTarget: Partial<typeof thisTargetModule.thisTarget> = {
      tabId: 1,
      frameId: 0,
      page: "test",
    };
    vi.spyOn(thisTargetModule, "thisTarget", "get").mockReturnValue(
      mockThisTarget as typeof thisTargetModule.thisTarget,
    );

    // Register a local handler (should not be used for allFrames)
    const mockHandler = vi.fn(async () => "local result");
    handlers.set("testMethod", mockHandler);

    // Mock chrome.runtime.sendMessage to return a messenger response
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      __webextMessenger: true,
      value: "remote result",
    } as any);

    // Import messenger after mocks are set up
    const { messenger } = await import("./sender.js");

    // Test: Send message to allFrames in same tab
    const result = await messenger(
      "testMethod",
      {},
      { tabId: 1, frameId: "allFrames" },
    );

    // Verify: Message was sent via chrome.runtime.sendMessage
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(result).toBe("remote result");

    // Verify: Local handler was not called
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test("should throw error when no local handler registered for same tab/frame", async () => {
    // Setup: Set thisTarget to have tabId: 1, frameId: 0
    const mockThisTarget: Partial<typeof thisTargetModule.thisTarget> = {
      tabId: 1,
      frameId: 0,
      page: "test",
    };
    vi.spyOn(thisTargetModule, "thisTarget", "get").mockReturnValue(
      mockThisTarget as typeof thisTargetModule.thisTarget,
    );

    // No handler registered

    // Import messenger and MessengerError after mocks are set up
    const { messenger } = await import("./sender.js");
    const { MessengerError } = await import("./shared.js");

    // Test: Send message to same tab and frame without handler
    try {
      await messenger("testMethod", {}, { tabId: 1, frameId: 0 });
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(MessengerError);
      expect((error as Error).message).toBe(
        "No handler registered locally for testMethod",
      );
    }

    // Verify: No message was sent via chrome.runtime.sendMessage
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
