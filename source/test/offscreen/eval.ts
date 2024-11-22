export function evalScript(script: string): unknown {
    // eslint-disable-next-line no-eval
    return eval(script);
}
