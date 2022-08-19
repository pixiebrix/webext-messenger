import { __getTabData } from "./thisTarget.js";
import { Method } from "./types.js";

declare global {
  interface MessengerMethods {
    // Update `numberOfPrivateMethods` if more methods are added
    __getTabData: typeof __getTabData;
  }
}

export const privateMethods = [__getTabData];

export const handlers = new Map<string, Method>();

export function didUserRegistereMethods(): boolean {
  return handlers.size > privateMethods.length;
}
