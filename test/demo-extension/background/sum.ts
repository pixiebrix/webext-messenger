export async function sum(...addends: number[]): Promise<number> {
  return addends.reduce((a, b) => a + b);
}
