# Notes around WebExtensions messaging

## Notes

- Every extension page except the background page and dev tools pages can be messaged via both `chrome.tabs` and `chrome.runtime`.
- `chrome.tabs` the first one requires having `chrome.tabs` API access + knowing the tab ID;
- `chrome.runtime` will message all the extension pages at once, which then have to synchronously know whether to handle the received message.

## Pitfalls

- "Runtime" messages are sent to all `chrome-extension://` pages sequentially; the first one to return "not undefined" will "handle" it.
- Returning a `Promise<undefined>` handles the message.
- Determining whether to handle the message locally needs to be synchronously.

## Unavoidable race conditions

- If you send a message to a context that hasn't yet loaded/registered, the messages will be ignored; They will be retried.
- If you send a message to a named target that doesn't know its own name yet, the message will be ignored; They will be retried.
