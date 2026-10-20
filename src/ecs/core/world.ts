// Entities are indices; a bitmask per entity says which components it has.

// Branded numbers: free at runtime, but the compiler keeps them apart.
export type Brand<T, B> = T & { readonly __brand: B };

// A slot index, reused after despawn. Never keep one across ticks.
export type EntityId = Brand<number, 'EntityId'>;
// Index + generation. Safe to store: a recycled slot makes it stale, not wrong.
export type Handle = Brand<number, 'Handle'>;
export type ComponentMask = Brand<number, 'ComponentMask'>;

export const MAX = 1024;

// A handle is generation << SLOT_BITS | slot in one int32. The slot needs only
// enough bits to hold MAX and one index past it (for NO_HANDLE); every other bit
// goes to the generation, so a slot can be reused this many times before its
// generations run out. 16/16 ran out after 65,536 bullets through one slot,
// about two hours of a boss firing.
const SLOT_BITS = 11;
const SLOT_MASK = (1 << SLOT_BITS) - 1;
export const GENERATIONS = 2 ** (32 - SLOT_BITS);
if (MAX > SLOT_MASK) throw new Error('MAX needs more SLOT_BITS: NO_HANDLE must decode past it');

export const bit = (n: number) => (1 << n) as ComponentMask;
export const NONE = 0 as ComponentMask;
// Allocates its argument array, so call it at module level, never per frame.
export const mask = (...bits: ComponentMask[]) =>
  bits.reduce((acc, b) => (acc | b) as ComponentMask, NONE);

// Decodes to an index past MAX, so it can never alias a live entity.
// 0 would: it is the first entity ever spawned.
export const NO_HANDLE = -1 as Handle;

export const world = {
  mask: new Uint32Array(MAX),
  alive: new Uint8Array(MAX),
  generation: new Uint32Array(MAX),
  freeList: new Int32Array(MAX),
  freeCount: 0,
  nextFresh: 0,
  tick: 0,
};

// Above half of GENERATIONS the int32 is negative; >>> reads the generation
// back unsigned, so that's harmless.
export const toHandle = (e: EntityId) => ((world.generation[e] << SLOT_BITS) | e) as Handle;
export const indexOf = (h: Handle) => (h & SLOT_MASK) as EntityId;
export const isLive = (h: Handle) => {
  const e = indexOf(h);
  return e < MAX && world.alive[e] === 1 && world.generation[e] === h >>> SLOT_BITS;
};

export function spawn(): EntityId {
  const e = (world.freeCount > 0 ? world.freeList[--world.freeCount] : world.nextFresh++) as EntityId;
  if (e >= MAX) throw new Error('entity pool exhausted');
  world.alive[e] = 1;
  world.mask[e] = 0;
  return e;
}

export function despawn(e: EntityId): void {
  world.alive[e] = 0;
  world.mask[e] = 0;
  world.generation[e]++;
  world.freeList[world.freeCount++] = e;
}

export const add = (e: EntityId, m: ComponentMask) => { world.mask[e] |= m; };
export const remove = (e: EntityId, m: ComponentMask) => { world.mask[e] &= ~m; };
export const has = (e: EntityId, m: ComponentMask) => (world.mask[e] & m) === m;

// Queries fill a preallocated buffer so systems allocate nothing per frame.
// A linear scan is fine at this size; archetype tables can replace it later
// without changing any system.
export function query(buf: Int32Array, all: ComponentMask, none: ComponentMask = NONE): number {
  let n = 0;
  for (let e = 0; e < world.nextFresh; e++) {
    const m = world.mask[e];
    if (world.alive[e] && (m & all) === all && (m & none) === 0) buf[n++] = e;
  }
  return n;
}

// Typed arrays only hold plain numbers, so the casts back to brands live here.
export const entityAt = (buf: Int32Array, i: number) => buf[i] as EntityId;
export const handleAt = (arr: Int32Array, e: EntityId) => arr[e] as Handle;

// Bumps every used slot's generation so handles from before go stale instead
// of pointing at whatever reuses their slot. Moving to the next arena keeps the
// tick, because the run's deadlines and the tick log are measured in it.
export function resetWorld(keepTick = false): void {
  for (let e = 0; e < world.nextFresh; e++) world.generation[e]++;
  world.mask.fill(0);
  world.alive.fill(0);
  world.freeCount = 0;
  world.nextFresh = 0;
  if (!keepTick) world.tick = 0;
}
