import * as test from 'fresh-tape';
import {createMessenger} from '../../index';
import {
  backgroundOnlyContract,
  getExtensionIdContract,
  sumContract,
  throwsContract,
  notRegisteredContract,
} from './background-handlers';

test('send message and get response', async (t) => {
  const getExtensionId = createMessenger(getExtensionIdContract);
  t.equal(await getExtensionId(), chrome.runtime.id);
});

test('support parameters', async (t) => {
  const sum = createMessenger(sumContract);
  t.equal(await sum(1, 2, 3, 4), 10);
});

test('handler must be executed in the background script', async (t) => {
  const backgroundOnly = createMessenger(backgroundOnlyContract);
  t.equal(await backgroundOnly(), true);
});

test('should receive error from a background handler', async (t) => {
  try {
    const throws = createMessenger(throwsContract);
    await throws();
    t.fail('throws() should have thrown but did not');
  } catch (error: unknown) {
    t.true(error instanceof Error);
    t.equal((error as any).message, 'This my error');
  }
});

test('should receive error from the background if it’s not registered', async (t) => {
  try {
    const notRegistered = createMessenger(notRegisteredContract);
    await notRegistered();
    t.fail('notRegistered() should have thrown but did not');
  } catch (error: unknown) {
    t.true(error instanceof Error);
    t.equal((error as any).message, 'No handler registered for notRegistered');
  }
});
