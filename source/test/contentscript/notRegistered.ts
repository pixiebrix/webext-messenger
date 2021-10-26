export async function notRegistered(): Promise<never> {
  throw new Error("This function should not have been registered");
}
