function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type ParametersExceptFirst<F> = F extends (
  arg0: any,
  ...rest: infer R
) => infer ReturnValue
  ? (...rest: R) => ReturnValue
  : never;
type BaseActionType = string;
type BasePayload = [browser.runtime.MessageSender, ...unknown[]];
type Method = (...parameters: BasePayload) => Promise<unknown>;
export type Contract<
  T extends BaseActionType = BaseActionType,
  M extends Method = Method,
  P extends ParametersExceptFirst<M> = ParametersExceptFirst<M>,
> = {
  type: T;
  method: M;
  publicMethod: P;
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

  return handler(sender, ...message.parameters);
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
}: Partial<T>): T['publicMethod'] {
  const messenger: T['publicMethod'] = async (...parameters) =>
    browser.runtime.sendMessage({
      type,
      parameters,
    });

  return messenger;
}
