export async function notRegisteredExternal(): Promise<never> {
  throw new Error("This function should not have been registered");
}
