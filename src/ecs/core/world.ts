// Entities are indices; a bitmask per entity, its signature, says which components it has.

// Branded numbers: free at runtime, but the compiler keeps them apart.
export type Brand<T, B> = T & { readonly __brand: B };

// A slot index, reused after despawn. Never keep one across ticks.
export type EntityId = Brand<number, 'EntityId'>;
// Index + generation. Safe to store: a recycled slot makes it stale, not wrong.
export type Handle = Brand<number, 'Handle'>;
export type ComponentMask = Brand<number, 'ComponentMask'>;

// How many entities can be alive at once, and so the length of every component array.
export const MAX_ENTITIES = 1024;

// A handle is generation << SLOT_BITS | slot in one int32. The slot needs only
// enough bits to hold MAX_ENTITIES and one index past it (for NOBODY); every other
// bit goes to the generation, so a slot can be reused this many times before its
// generations run out. 16/16 ran out after 65,536 bullets through one slot,
// about two hours of a boss firing.
const SLOT_BITS = 11;
const SLOT_MASK = (1 << SLOT_BITS) - 1;
export const GENERATIONS = 2 ** (32 - SLOT_BITS);
if (MAX_ENTITIES > SLOT_MASK) throw new Error('MAX_ENTITIES needs more SLOT_BITS: NOBODY must decode past it');

export const bit = (n: number) => (1 << n) as ComponentMask;
export const NONE = 0 as ComponentMask;
// Allocates its argument array, so call it at module level, never per frame.
export const mask = (...bits: ComponentMask[]) =>
  bits.reduce((acc, b) => (acc | b) as ComponentMask, NONE);

// The handle that points at no one: `Wielder.held[player] = NOBODY` is empty hands.
// Decodes to an index past MAX_ENTITIES, so it can never alias a live entity.
// 0 would: it is the first entity ever spawned.
export const NOBODY = -1 as Handle;

const signature = new Uint32Array(MAX_ENTITIES);
const inUse = new Uint8Array(MAX_ENTITIES);
export const world = {
  // Each entity's signature: one bit per component it has.
  signature,
  // 1 while a row holds an entity. Not whether it's alive in the game: a downed
  // boss keeps its row, with the Dead tag in its signature.
  inUse,
  /** @deprecated Use world.inUse, the same array. Kept only while the other layers move over. */
  alive: inUse,
  generation: new Uint32Array(MAX_ENTITIES),
  freeList: new Int32Array(MAX_ENTITIES),
  freeCount: 0,
  nextFresh: 0,
  tick: 0,
};

// Above half of GENERATIONS the int32 is negative; >>> reads the generation
// back unsigned, so that's harmless.
export const toHandle = (entity: EntityId) => ((world.generation[entity] << SLOT_BITS) | entity) as Handle;
export const indexOf = (h: Handle) => (h & SLOT_MASK) as EntityId;
export const isLive = (h: Handle) => {
  const entity = indexOf(h);
  return entity < MAX_ENTITIES && world.inUse[entity] === 1 && world.generation[entity] === h >>> SLOT_BITS;
};

// A slot that has used up its generations is retired for the rest of the run:
// one more reuse would wrap to generation 0 and wake up handles from long ago.
// It costs one slot per 2 million reuses, and makes a wrap impossible rather
// than unlikely.
const retired = (e: number) => world.generation[e] >= GENERATIONS;

export function spawn(): EntityId {
  let entity: number;
  if (world.freeCount > 0) {
    entity = world.freeList[--world.freeCount];
  } else {
    // Retired slots are never on the free list, but a reset makes every slot fresh again.
    while (world.nextFresh < MAX_ENTITIES && retired(world.nextFresh)) world.nextFresh++;
    entity = world.nextFresh++;
  }
  if (entity >= MAX_ENTITIES) throw new Error('entity pool exhausted');
  world.inUse[entity] = 1;
  world.signature[entity] = 0;
  return entity as EntityId;
}

// Dev builds and tests only. world.ts can't know the component columns (they
// import it), so the components module registers the check that needs them.
let checkDespawn: ((entity: EntityId) => void) | null = null;
export function onDespawn(check: (entity: EntityId) => void): void {
  checkDespawn = check;
}

export function despawn(entity: EntityId): void {
  // Before anything changes, so a failed check leaves the world as it was.
  if (import.meta.env.DEV) checkDespawn?.(entity);
  world.inUse[entity] = 0;
  world.signature[entity] = 0;
  world.generation[entity]++;
  if (!retired(entity)) world.freeList[world.freeCount++] = entity;
}

export const add = (entity: EntityId, m: ComponentMask) => { world.signature[entity] |= m; };
export const remove = (entity: EntityId, m: ComponentMask) => { world.signature[entity] &= ~m; };
export const has = (entity: EntityId, m: ComponentMask) => (world.signature[entity] & m) === m;

// Queries fill a preallocated buffer so systems allocate nothing per frame.
// A linear scan is fine at this size; archetype tables can replace it later
// without changing any system.
export function query(buf: Int32Array, all: ComponentMask, none: ComponentMask = NONE): number {
  let n = 0;
  for (let e = 0; e < world.nextFresh; e++) {
    const s = world.signature[e];
    if (world.inUse[e] && (s & all) === all && (s & none) === 0) buf[n++] = e;
  }
  return n;
}

// Typed arrays only hold plain numbers, so the casts back to brands live here.
export const entityAt = (buf: Int32Array, i: number) => buf[i] as EntityId;
export const handleAt = (arr: Int32Array, entity: EntityId) => arr[entity] as Handle;

// Bumps every used slot's generation so handles from before go stale instead
// of pointing at whatever reuses their slot. Moving to the next arena keeps the
// tick, because the run's deadlines and the tick log are measured in it.
export function resetWorld(keepTick = false): void {
  for (let e = 0; e < world.nextFresh; e++) if (!retired(e)) world.generation[e]++;
  world.signature.fill(0);
  world.inUse.fill(0);
  world.freeCount = 0;
  world.nextFresh = 0;
  if (!keepTick) world.tick = 0;
}
