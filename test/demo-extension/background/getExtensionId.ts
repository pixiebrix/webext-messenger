import {Contract} from '../../../index';

export const getExtensionIdContract: Contract<typeof getExtensionId> = {
  type: 'getExtensionId',
};
export async function getExtensionId(): Promise<string> {
  return chrome.runtime.id;
}
