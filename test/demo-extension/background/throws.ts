export async function _throws(): Promise<never> {
  throw new Error("This my error");
}
