// Coroutines for sequences that span many ticks (boss choreography).
// Their position cannot be saved, so they only ever run inside one boss phase;
// the phase itself is domain state.
export type Script = Generator<void, void, void>;

export function* waitTicks(n: number): Script {
  for (let i = 0; i < n; i++) yield;
}
