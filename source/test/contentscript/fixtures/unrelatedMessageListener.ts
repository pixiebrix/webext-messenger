chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse): boolean | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((message as any)?.type === "sleep") {
      console.log(
        "I’m an unrelated message listener, but I'm replying anyway to",
        { message },
      );

      void Promise.resolve("User is on Windows 95").then(sendResponse);

      return true;
    }

    console.log("I’m an unrelated message listener. I’ve seen", { message });
    return undefined;
  },
);
