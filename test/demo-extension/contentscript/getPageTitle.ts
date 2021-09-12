export async function getPageTitle(): Promise<string> {
  console.log(window.parent === self, document.title);
  return document.title;
}

console.log(3);
