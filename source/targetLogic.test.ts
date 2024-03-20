import { assert, describe, test, vi } from "vitest";
import { getActionForMessage } from "./targetLogic.js";
import { type Tabs } from "webextension-polyfill";
import { isContentScript } from "webext-detect-page";

vi.mock("webext-detect-page");

const tab = {
  id: 1,
  url: "http://example.com",
  windowId: 1,
  active: true,
  index: 0,
  pinned: false,
  highlighted: true,
  incognito: false,
} satisfies Tabs.Tab;

const senders = {
  background: { page: "background" },
  contentScript: { tab },
  somePage: { page: "/page.html" },
} as const;

const targets = {
  background: { page: "background" },
  somePage: { page: "/page.html" },
  anyPage: { page: "any" },
  thisTab: { tabId: "this" },
} as const;

const thisTarget = {
  background: { page: "background" },
  somePage: { page: "/page.html" },
  tab: { tabId: 1, frameId: 0 },
  frame: { tabId: 1, frameId: 1 },
} as const;

describe("getActionForMessage", async () => {
  test.each([
    // Sender         Target        Receiver      Expected
    ["contentScript", "background", "background", "respond"],
    ["contentScript", "background", "somePage", "ignore"],
    ["contentScript", "background", "tab", "respond"], // Wrong, but won't happen
    ["contentScript", "background", "frame", "respond"], // Wrong, but won't happen

    ["contentScript", "anyPage", "background", "respond"],
    ["contentScript", "anyPage", "somePage", "respond"],
    ["contentScript", "anyPage", "tab", "respond"],
    ["contentScript", "anyPage", "frame", "respond"],

    ["contentScript", "somePage", "background", "ignore"],
    ["contentScript", "somePage", "somePage", "respond"],
    ["contentScript", "somePage", "tab", "respond"], // Wrong, but won't happen
    ["contentScript", "somePage", "frame", "respond"], // Wrong, but won't happen

    ["contentScript", "thisTab", "background", "forward"],
    ["contentScript", "thisTab", "somePage", "forward"],
    ["contentScript", "thisTab", "tab", "respond"], // Won't happen, content scripts cannot target tabs
    ["contentScript", "thisTab", "frame", "respond"], // Won't happen, content scripts cannot target tabs
  ] satisfies Array<
    [
      keyof typeof senders,
      keyof typeof targets,
      keyof typeof thisTarget,
      "respond" | "forward" | "ignore",
    ]
  >)(
    "from %s to %s, receiver %s should %s",
    async (from, to, receiver, expected) => {
      const isCs = receiver === "tab" || receiver === "frame";
      vi.mocked(isContentScript).mockReturnValueOnce(isCs);
      vi.stubGlobal("location", {
        origin: isCs ? "http://example.com" : "chrome-extension://extension-id",
      });

      const result = getActionForMessage(
        senders[from],
        targets[to],
        thisTarget[receiver],
      );
      assert(
        result === expected,
        `"${receiver}" got message for "${to}" and decided to ${result.toUpperCase()} instead of ${expected.toUpperCase()}`,
      );
    },
  );
});
