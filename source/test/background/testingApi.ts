import browser from "webextension-polyfill";

export async function ensureScripts(tabId: number): Promise<void> {
  await browser.tabs.executeScript(tabId, {
    file: "contentscript/registration.js",
  });
}

export async function getAllFrames(
  tabId: number
): Promise<[parentFrame: number, iframe: number]> {
  await new Promise((resolve) => {
    setTimeout(resolve, 5000);
  });
  const [parentFrame, iframe] = await browser.webNavigation.getAllFrames({
    tabId,
  });

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return [parentFrame!.frameId, iframe!.frameId];
}

export async function openTab(url: string): Promise<number> {
  const tab = await browser.tabs.create({
    active: false,
    url,
  });
  return tab.id!;
}

export async function closeTab(tabId: number): Promise<void> {
  await browser.tabs.remove(tabId);
}
