import { getContentScriptMethod } from "../../../index";

export const getPageTitle = getContentScriptMethod("getPageTitle");
export const setPageTitle = getContentScriptMethod("setPageTitle");
export const closeSelf = getContentScriptMethod("closeSelf");
export const sumIfMeta = getContentScriptMethod("sumIfMeta");
export const contentScriptOnly = getContentScriptMethod("contentScriptOnly");
export const throws = getContentScriptMethod("throws");
export const notRegistered = getContentScriptMethod("notRegistered");
export const getSelf = getContentScriptMethod("getSelf");
