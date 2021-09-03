// This file deliberately does not registed itself. It's only here for testing

export async function notRegistered(): Promise<never> {
  throw new Error("This function should not have been registerd");
}
