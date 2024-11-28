import { getNotifier, getMethod } from "webext-messenger";

const target = { page: "offscreen" };

export const getLocation = getMethod("getLocation", target);
export const addFrame = getNotifier("addFrame", target);
export const getTrace = getMethod("getTrace", target);
