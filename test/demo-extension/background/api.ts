import { getMethod } from "../../../index";

export const sum = getMethod("sum");
export const throws = getMethod("throws");
export const sumIfMeta = getMethod("sumIfMeta");
export const notRegistered = getMethod("notRegistered");
export const notRegisteredNotification = getMethod("notRegistered", {
  isNotification: true,
});
export const getExtensionId = getMethod("getExtensionId");
export const backgroundOnly = getMethod("backgroundOnly");
export const getSelf = getMethod("getSelf");
