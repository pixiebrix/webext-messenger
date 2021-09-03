export async function _sum(...addends: number[]): Promise<number> {
  return addends.reduce((a, b) => a + b);
}
