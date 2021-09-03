import { getMethod, getRegistration } from "../../../index";

async function _getExtensionId(): Promise<string> {
  return chrome.runtime.id;
}

const name = "getExtensionId";
export const getExtensionId = getMethod<typeof _getExtensionId>(name);
export const registerGetExtensionId = getRegistration(name, _getExtensionId);
