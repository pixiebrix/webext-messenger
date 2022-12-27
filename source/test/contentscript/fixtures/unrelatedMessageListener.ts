chrome.runtime.onMessage.addListener(
  (message: unknown): Promise<string> | void => {
    if ((message as any)?.type === "sleep") {
      console.log(
        "I’m an unrelated message listener, but I'm replying anyway to",
        { message }
      );
      return Promise.resolve("/r/nosleep");
    }

    console.log("I’m an unrelated message listener. I’ve seen", { message });
  }
);
