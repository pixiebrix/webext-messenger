import { getContentScriptMethod } from "../..";

export const getPageTitle = getContentScriptMethod("getPageTitle");
export const getPageTitleNotification = getContentScriptMethod("getPageTitle", {
  isNotification: true,
}); // Test-only; Notifications can't be getters
export const setPageTitle = getContentScriptMethod("setPageTitle");
export const closeSelf = getContentScriptMethod("closeSelf");
export const sumIfMeta = getContentScriptMethod("sumIfMeta");
export const contentScriptOnly = getContentScriptMethod("contentScriptOnly");
export const throws = getContentScriptMethod("throws");
export const notRegistered = getContentScriptMethod("notRegistered");
export const notRegisteredNotification = getContentScriptMethod(
  "notRegistered",
  { isNotification: true }
);
export const getSelf = getContentScriptMethod("getSelf");
