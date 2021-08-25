import {Contract} from '../..';

export const getExtensionIdContract: Partial<
  Contract<string, typeof getExtensionId>
> = {
  type: 'getExtensionId'
};

export async function getExtensionId(
  sender: browser.runtime.MessageSender
): Promise<string> {
  if (!sender.url) {
    throw new Error('Sender not allowed');
  }

  return chrome.runtime.id;
}
