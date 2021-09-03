// This file deliberately does not registed itself. It's only here for testing
import { getMethod } from "../../../index";

async function _notRegistered(): Promise<never> {
  throw new Error("This function should not have been registerd");
}

const name = "notRegistered";
export const notRegistered = getMethod<typeof _notRegistered>(name);
