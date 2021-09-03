import { getMethod, getRegistration } from "../../../index";

async function _sum(...addends: number[]): Promise<number> {
  return addends.reduce((a, b) => a + b);
}

const name = "sum";
export const sum = getMethod<typeof _sum>(name);
export const registerSum = getRegistration(name, _sum);
