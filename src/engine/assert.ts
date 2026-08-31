/**
 * Compile-time exhaustiveness guard. Placed in the `default` of a `switch` over a
 * discriminated union, it makes adding a new variant a type error at every site that
 * forgot to handle it — the union stops being trusted only at runtime.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
