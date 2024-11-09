# Test extension

To test this package, run these 2 commands in parallel:

```sh
npm run demo:watch
npx web-ext run --target=chromium
```

Several tabs will automatically open, this is the various contexts running tests; let it run.

**The tests are to be visually evaluated, they don't fail CI.** You can open the console to see the results of each test. Some contexts are run automatically:

- background to content scripts
- content script to background
- content script to content script (via runtime)

Others are run only when you open the specific context, like the options page.

## File organization

Since the messenger should be able to call a context's APIs from anywhere, you can load a `api.test.ts` from any context. For example:

- load `contentScript/api.test.ts` in background
- load `contentScript/api.test.ts` in a content script
- load `background/api.test.ts` in a content script
- load `background/api.test.ts` in the options page
- load `background/api.test.ts` in the dev tools
