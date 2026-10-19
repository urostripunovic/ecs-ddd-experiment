// Seeded RNG (mulberry32). The simulation never calls Math.random: the same
// seed must replay the same drops, or tests and bug reports stop being repeatable.
const state = { s: 1 };

export function seedRng(seed: number): void {
  state.s = seed >>> 0 || 1;
}

// The RNG's position lives for the whole run, so arena 2's drops depend on
// what arena 1 drew. Read and restored only to compare or save a run.
export const rngState = () => state.s;
export function restoreRng(s: number): void {
  state.s = s;
}

// Uniform in [0, 1).
export function random(): number {
  state.s = (state.s + 0x6d2b79f5) >>> 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randomRange = (min: number, max: number) => min + random() * (max - min);
