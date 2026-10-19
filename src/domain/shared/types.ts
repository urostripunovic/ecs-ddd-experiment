// Branded so a BossId can never be passed where a PlayerId is expected.
export type Brand<T, B> = T & { readonly __brand: B };

// Stable and saved, unlike ECS entity handles, which are recycled.
export type BossId = Brand<string, 'BossId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type WeaponId = Brand<string, 'WeaponId'>;

// The domain's only clock. Never Date.now(): pausing, slow motion and tests all depend on it.
export type Tick = Brand<number, 'Tick'>;

// Shared empty result so the common no-op case allocates nothing.
export const NO_EVENTS: readonly never[] = Object.freeze([]);

// Ends every decide, evolve and projector switch, so adding a case breaks the
// build everywhere it must be handled.
export const assertNever = (x: never): never => {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
};
