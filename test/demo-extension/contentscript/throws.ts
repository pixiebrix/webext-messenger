export async function throws(): Promise<never> {
  throw new Error("This my error");
}
