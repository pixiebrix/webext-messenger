import { isBackgroundPage } from "webext-detect-page";
import { Contract } from "../../../index";

export const backgroundOnlyContract: Contract<typeof backgroundOnly> = {
  type: "backgroundOnly",
};
export async function backgroundOnly(): Promise<true> {
  if (!isBackgroundPage()) {
    throw new Error("Wrong context");
  }

  return true;
}
