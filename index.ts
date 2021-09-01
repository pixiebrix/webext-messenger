type Arguments = any[];
type Method = (
  this: browser.runtime.MessageSender,
  ...args: Arguments
) => Promise<unknown>;

export type Contract<TMmethod extends Method = Method> = {
  type: string;
  method?: TMmethod;
};

// TODO: It may include additional meta, like information about the original sender
type Message<TArguments extends Arguments = Arguments> = {
  type: string;
  args: TArguments;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMessage(value: unknown): value is Message {
  // TODO: Add library-specific key to safely catch non-handled messages
  //  https://github.com/pixiebrix/extension-messaging/pull/8#discussion_r700095639
  return (
    isObject(value) &&
    typeof value['type'] === 'string' &&
    Array.isArray(value['args'])
  );
}

const handlers = new Map<string, Method>();

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

/**
 * Registers a handler for a specific method.
 * To be called in the receiving end.
 */
export function registerMethod<TContract extends Required<Contract>>(
  type: TContract['type'],
  handler: TContract['method'],
): void {
  if (handlers.has(type)) {
    throw new Error(`Handler already set for ${type}`);
  }

  handlers.set(type, handler);
  browser.runtime.onMessage.addListener(onMessageListener);
}

/**
 * Replicates the original method, including its types.
 * To be called in the sender’s end.
 */
export function getMethod<
  TContract extends Contract,
  // The original Method might have `this` (sender) specified, but this isn't applicable here
  LocalMethod extends OmitThisParameter<NonNullable<TContract['method']>>,
>({type}: TContract): LocalMethod {
  return (async (...args) =>
    browser.runtime.sendMessage({
      type,
      args,
    })) as LocalMethod;
}
