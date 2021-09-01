import * as test from 'fresh-tape';
import {getMethod} from '../../index';
import {backgroundOnlyContract} from './background/backgroundOnly';
import {getExtensionIdContract} from './background/getExtensionId';
import {notRegisteredContract} from './background/noRegistered';
import {sumContract} from './background/sum';
import {sumifMetaContract} from './background/sumIfMeta';
import {throwsContract} from './background/throws';

test('send message and get response', async (t) => {
  const getExtensionId = getMethod(getExtensionIdContract);
  t.equal(await getExtensionId(), chrome.runtime.id);
});

test('support parameters', async (t) => {
  const sum = getMethod(sumContract);
  t.equal(await sum(1, 2, 3, 4), 10);
});

test('support parameters', async (t) => {
  const sumIfMeta = getMethod(sumifMetaContract);
  t.equal(await sumIfMeta(1, 2, 3, 4), 10);
});

test('handler must be executed in the background script', async (t) => {
  const backgroundOnly = getMethod(backgroundOnlyContract);
  t.equal(await backgroundOnly(), true);
});

test('should receive error from a background handler', async (t) => {
  try {
    const throws = getMethod(throwsContract);
    await throws();
    t.fail('throws() should have thrown but did not');
  } catch (error: unknown) {
    t.true(error instanceof Error);
    t.equal((error as any).message, 'This my error');
  }
});

test('should receive error from the background if it’s not registered', async (t) => {
  try {
    const notRegistered = getMethod(notRegisteredContract);
    await notRegistered();
    t.fail('notRegistered() should have thrown but did not');
  } catch (error: unknown) {
    t.true(error instanceof Error);
    t.equal((error as any).message, 'No handler registered for notRegistered');
  }
});
