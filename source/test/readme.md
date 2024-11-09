# Test extension

To test this package, run these 2 commands in parallel:

```sh
npm run demo:watch
npx web-ext run --target=chromium
```

Several tabs will automatically open, this is the various contexts running tests. You can open the console of the 2 main tabs, the background console and other contexts' consoles to see the results of each test.

The `registration.ts` files are APIs for that specific context and can be called/tested from any other context. For example the background loads both `background/registration.ts` (to receive calls) and `contentscript/api.test.ts` (to start testing the content script API).
