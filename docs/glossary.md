# Glossary

## context

Every page that can execute javascript is a "context", for this reason occasionally a context is referred to as a "page". In the case of content scripts though there are multiple contexts on a page, at least 1 "content script" context and an "unsafe" context.

## content scripts

Content scripts run in an isolated world in order not to conflict with the page’s local variables and properties. For example this lets us load jQuery without conflicting with the page’s jQuery.

## unsafe context

Because content scrpts run in an isolated (safe) world, breaching into the website’s world is referred to as "unsafe" because it might casue conflicts and introduce vulnerabilities. Communication with the unsafe context must be done carefully and without trust.

## target (context)

A message is generally intended to be handled by a specific context. The target contains the details about the context, like the tab ID or the page URL.

## to handle (a message)

When receiving a message, "handling" means returning "not `undefined`", which will then be returned to the message sender. If you return `undefined`, the message will be sent to the next compatible context. For example `chrome.runtime.sendMessage` will send it to every open `chrome-extension://` page, including the background page.
