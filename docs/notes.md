# Notes around WebExtensions messaging

## Notes

- Every extension page except the background page and dev tools pages can be messaged via both `chrome.tabs` and `chrome.runtime`.
- `chrome.tabs` requires having `chrome.tabs` API access + knowing the tab ID;
- `chrome.runtime` will message all the extension pages at once, which then have to synchronously know whether to handle the received message.

## Pitfalls

- "Runtime" messages are sent to all `chrome-extension://` pages sequentially; the first one to return "not undefined" will "handle" it.
- Calling `sendResponse` handles the message.
- Determining whether to handle the message locally needs to be synchronous. You can return `true` synchronously to indicate that you will handle it asynchronously by calling `sendResponse` at a later time.

## Unavoidable race conditions

- If you send a message to a context that hasn't yet loaded/registered, the messages will be ignored; `webext-messenger` will retry sending them.
- If you send a message to a named target that doesn't know its own name yet, the message will be ignored; `webext-messenger` will retry sending them.
