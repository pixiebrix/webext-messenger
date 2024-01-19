browser.runtime.onMessage.addListener(
  (message: unknown): Promise<string> | void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
