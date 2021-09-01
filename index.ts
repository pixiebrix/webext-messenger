function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type BaseActionType = string;
type BasePayload = [...any[]];
type Method = (
  this: browser.runtime.MessageSender,
  ...parameters: BasePayload
) => Promise<unknown>;
export type Contract<
  T extends BaseActionType = BaseActionType,
  M extends Method = Method,
> = {
  type: T;
  method: M;
};

const handlers = new Map<BaseActionType, Method>();

export type Message<
  T extends BaseActionType = BaseActionType,
  P extends BasePayload = BasePayload,
> = {
  type: T;
  parameters: P;
};

export function isMessage(value: unknown): value is Message {
  return (
    isObject(value) &&
    typeof value['type'] === 'string' &&
    Array.isArray(value['parameters'])
  );
}

// MUST NOT be `async` or Promise-returning-only
function onMessageListener(
  message: unknown,
  sender: browser.runtime.MessageSender,
): Promise<unknown> | void {
  if (!isMessage(message)) {
    return;
  }

  const handler = handlers.get(message.type);
  if (!handler) {
    throw new Error('No handler registered for ' + message.type);
  }

  return handler.call(sender, ...message.parameters);
}

export function addHandler<T extends Contract>(
  type: T['type'],
  handler: T['method'],
): void {
  if (handlers.has(type)) {
    throw new Error(`Handler already set for ${type}`);
  }

  handlers.set(type, handler);
  browser.runtime.onMessage.addListener(onMessageListener);
}

export function createMessenger<T extends Contract>({
  type,
}: Partial<T>): T['method'] {
  const messenger: T['method'] = async (...parameters) =>
    browser.runtime.sendMessage({
      type,
      parameters,
    });

  return messenger;
}
