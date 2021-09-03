import { getMethod, getRegistration } from "../../../index";

async function _throws(): Promise<never> {
  throw new Error("This my error");
}

const name = "throws";
export const throws = getMethod<typeof _throws>(name);
export const registerThrows = getRegistration(name, _throws);
