export function addFrame(): void {
  const frame = document.createElement("iframe");
  frame.src = "https://example.com";
  document.body.append(frame);
}
