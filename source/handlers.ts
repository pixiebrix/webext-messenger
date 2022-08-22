import { __getTabData } from "./thisTarget.js";
import { Method } from "./types.js";

declare global {
  interface MessengerMethods {
    // Update `privateMethods` if more methods are added
    __getTabData: typeof __getTabData;
  }
}

const privateMethods = new Map<string, Method>([
  ["__getTabData", __getTabData],
]);

export const handlers = new Map<string, Method>();

export function getUserRegisterMethods(): Array<[string, Method]> {
  return [...handlers].filter(([name]) => !privateMethods.has(name));
}

export function didUserRegisterMethods(): boolean {
  return getUserRegisterMethods().length > 0;
}
