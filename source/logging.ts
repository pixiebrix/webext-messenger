/* Warning: Do not use import browser-polyfill directly or indirectly */

// .bind preserves the call location in the console
const debug = console.debug.bind(console, "Messenger:");
const warn = console.warn.bind(console, "Messenger:");

const noop: (...args: unknown[]) => void = () => {
  /* */
};

// Default to "no logs"
export const log = { debug: noop, warn: noop };

export function toggleLogging(enabled: boolean): void {
  log.debug = enabled ? debug : noop;
  log.warn = enabled ? warn : noop;
}
