import { __getTabData } from "./thisTarget.js";
import { type Method } from "./types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Interface required for declaration merging
  interface MessengerMethods {
    // Update `privateMethods` if more methods are added
    __getTabData: typeof __getTabData;
  }
}

export const privateMethods = [__getTabData];

export const handlers = new Map<string, Method>();

export function didUserRegisterMethods(): boolean {
  return handlers.size > privateMethods.length;
}
