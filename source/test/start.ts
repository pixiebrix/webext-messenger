const options = document.querySelector<HTMLButtonElement>("#options")!;
options.disabled = false;
options.addEventListener("click", () => {
  void chrome.runtime.sendMessage("open-options-page");
});
