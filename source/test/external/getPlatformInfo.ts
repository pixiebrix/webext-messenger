export async function getPlatformInfo(): Promise<chrome.runtime.PlatformInfo> {
  return chrome.runtime.getPlatformInfo();
}
