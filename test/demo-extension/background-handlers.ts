import {isBackgroundPage} from 'webext-detect-page';

import {Contract} from '../..';

export const getExtensionIdContract: Partial<
  Contract<string, typeof getExtensionId>
> = {
  type: 'getExtensionId',
};

export const sumContract: Partial<Contract<string, typeof sum>> = {
  type: 'sum',
};

export const notRegisteredContract: Partial<
  Contract<string, () => Promise<never>>
> = {
  type: 'notRegistered',
};

export const backgroundOnlyContract: Partial<
  Contract<string, typeof backgroundOnly>
> = {
  type: 'backgroundOnly',
};

export const throwsContract: Partial<Contract<string, typeof throws>> = {
  type: 'throws',
};

export async function getExtensionId(): Promise<string> {
  return chrome.runtime.id;
}

export async function sum(
  _: browser.runtime.MessageSender,
  ...addends: number[]
): Promise<number> {
  return addends.reduce((a, b) => a + b);
}

export async function backgroundOnly(): Promise<true> {
  if (!isBackgroundPage()) {
    throw new Error('Wrong context');
  }

  return true;
}

export async function throws(): Promise<never> {
  throw new Error('This my error');
}
