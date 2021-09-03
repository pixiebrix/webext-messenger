export async function getExtensionId(): Promise<string> {
  return chrome.runtime.id;
}
