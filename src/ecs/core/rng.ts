// Seeded randomness. The simulation never calls Math.random: the same seed must
// replay the same run, or tests and bug reports stop being repeatable.
//
// One generator per job (a stream), each started from the run's seed and its
// own key, and passed to the system that draws from it (dependency injection).
// One shared generator would let a new draw anywhere shift every later draw
// everywhere: a seed would quietly become a different run.

// A source of numbers in [0, 1). Systems take this, never a global.
export interface Random {
  next(): number;
  range(min: number, max: number): number;
}

// mulberry32: small, fast and good enough for a game.
export class Rng implements Random {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  get state(): number {
    return this.s;
  }
  set state(s: number) {
    this.s = s;
  }
}

// A pure draw from a seed and a key, for choices that must not move any
// stream: planning the run's arenas mustn't change which drops a seed gives.
export function hashDraw(seed: number, key: number): number {
  let t = (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(key >>> 0, 0x85ebca77)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// The run's streams, one per job. Their positions live for the whole run.
// Only the composition roots (the tick order, the run's start) read this;
// systems get the stream they need as a parameter.
const STREAM_KEYS = { drops: 1, perks: 2, stock: 3, bloom: 4, dizzy: 5 } as const;
export type StreamName = keyof typeof STREAM_KEYS;
export const streams: Record<StreamName, Rng> = {
  drops: new Rng(1), perks: new Rng(1), stock: new Rng(1), bloom: new Rng(1), dizzy: new Rng(1),
};

export function seedStreams(seed: number): void {
  for (const name of Object.keys(STREAM_KEYS) as StreamName[]) {
    streams[name].state = Math.floor(hashDraw(seed, STREAM_KEYS[name]) * 0xffffffff) || 1;
  }
}
seedStreams(1);

// Where every stream is, to save or compare a run, and to put them back.
export const streamsState = (): Record<StreamName, number> => ({
  drops: streams.drops.state, perks: streams.perks.state, stock: streams.stock.state,
  bloom: streams.bloom.state, dizzy: streams.dizzy.state,
});
export function restoreStreams(saved: Record<StreamName, number>): void {
  for (const name of Object.keys(saved) as StreamName[]) streams[name].state = saved[name];
}
