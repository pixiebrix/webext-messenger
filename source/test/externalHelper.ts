// This content script only helps the external website know the extension's ID and run the tests.

document.querySelector<HTMLInputElement>('[name="extensionId"]')!.value =
  chrome.runtime.id;
