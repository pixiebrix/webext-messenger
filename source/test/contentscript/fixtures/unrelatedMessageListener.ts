chrome.runtime.onMessage.addListener(
  (message: unknown, _, sendResponse): Promise<string> | void => {
    if ((message as any)?.type === "sleep") {
      console.log(
        "I’m an unrelated message listener, but I'm replying anyway to",
        { message }
      );

      sendResponse("Good soup");
      return;
    }

    console.log("I’m an unrelated message listener. I’ve seen", { message });
  }
);
