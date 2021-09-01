function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type OperationType = string;
type Arguments = any[];
type Method = (
  this: browser.runtime.MessageSender,
  ...args: Arguments
) => Promise<unknown>;
export type Contract<
  TType extends OperationType = OperationType,
  TMmethod extends Method = Method,
> = {
  type: TType;
  method: TMmethod;
};

const handlers = new Map<OperationType, Method>();

export type Message<
  TType extends OperationType = OperationType,
  TArguments extends Arguments = Arguments,
> = {
  type: TType;
  args: TArguments;
};

export function isMessage(value: unknown): value is Message {
  // TODO: Add library-specific key to safely catch non-handled messages
  //  https://github.com/pixiebrix/extension-messaging/pull/8#discussion_r700095639
  return (
    isObject(value) &&
    typeof value['type'] === 'string' &&
    Array.isArray(value['args'])
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
  if (handler) {
    return handler.call(sender, ...message.args);
  }

  throw new Error('No handler registered for ' + message.type);
}

export function addHandler<TContract extends Contract>(
  type: TContract['type'],
  handler: TContract['method'],
): void {
  if (handlers.has(type)) {
    throw new Error(`Handler already set for ${type}`);
  }

  handlers.set(type, handler);
  browser.runtime.onMessage.addListener(onMessageListener);
}

export function createMessenger<TContract extends Contract>({
  type,
}: Partial<TContract>): TContract['method'] {
  const messenger: TContract['method'] = async (...args) =>
    browser.runtime.sendMessage({
      type,
      args,
    });

  return messenger;
}
