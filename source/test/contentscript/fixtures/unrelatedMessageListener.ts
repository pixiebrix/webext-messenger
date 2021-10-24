browser.runtime.onMessage.addListener((message: unknown) => {
  console.log("I’m an unrelated message listener. I’ve seen", { message });
});
