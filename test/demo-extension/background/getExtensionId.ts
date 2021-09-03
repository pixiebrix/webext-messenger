export async function _getExtensionId(): Promise<string> {
  return chrome.runtime.id;
}
