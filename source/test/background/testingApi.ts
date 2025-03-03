import { once } from "webext-messenger/shared.js";

export async function ensureScripts(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["contentscript/registration.js"],
  });
}

type Targets = {
  tabId: number;
  parentFrame: number;
  iframe: number;
};

export async function createTargets(): Promise<Targets> {
  const tabId = await openTab(
    "https://fregante.github.io/pixiebrix-testing-ground/Will-receive-CS-calls/Parent?iframe=./Child",
  );

  // Append local page iframe
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    // eslint-disable-next-line object-shorthand -- It breaks Chrome's stringifier 😮‍💨
    func: () => {
      const iframe = document.createElement("iframe");
      iframe.src = chrome.runtime.getURL("iframe.html");
      document.body.append(iframe);
    },
  });

  let limit = 100;
  let frames;
  while (limit--) {
    // eslint-disable-next-line no-await-in-loop -- It's a retry loop
    frames = (await chrome.webNavigation.getAllFrames({
      tabId,
    }))!;

    if (frames.length >= 2) {
      // The local frame won't appear in Chrome 🤷‍♂️ but it will in Firefox
      return {
        tabId,
        parentFrame: frames[0]!.frameId,
        iframe: frames.find(
          (frame) => frame.frameId > 0 && frame.url.startsWith("http"),
        )!.frameId,
      };
    }

    // eslint-disable-next-line no-await-in-loop -- It's a retry loop
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  console.error({ frames });
  throw new Error("The expected frames were not found");
}

const getHiddenWindow = once(async (): Promise<number> => {
  const { id } = await chrome.windows.create({
    focused: false,
    state: "minimized",
  });
  return id!;
});

export async function openTab(url: string): Promise<number> {
  const tab = await chrome.tabs.create({
    windowId: await getHiddenWindow(),
    active: false,
    url,
  });
  return tab.id!;
}

export async function closeHiddenWindow(): Promise<void> {
  return chrome.windows.remove(await getHiddenWindow());
}

export async function closeTab(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId);
}
