# Test extension

To test this package, run these 2 commands in parallel:

```sh
npm run demo:watch
npx web-ext run --target=chromium
```

Several tabs will automatically open, this is the background contexts running tests; let it run.

A start page will also run, follow the instructions there.

**The tests are to be visually evaluated, they [don't fail CI](https://github.com/pixiebrix/webext-messenger/issues/28).**

## File organization

Since the messenger should be able to call a context's APIs from anywhere, you can load a `api.test.ts` from any context. For example:

- load `contentScript/api.test.ts` in background
- load `contentScript/api.test.ts` in a content script
- load `background/api.test.ts` in a content script
- load `background/api.test.ts` in the options page
- load `background/api.test.ts` in the dev tools
