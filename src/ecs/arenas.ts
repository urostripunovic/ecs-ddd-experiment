// Arena layouts as data. The run (domain) decides which arena you're in; what
// that arena looks like is simulation detail, so it lives here.
import { FINAL, UNCHAINED, WARDEN, type BossDef } from './bosses/defs';
import { hashDraw } from './core/rng';
import { hp, meters, type Meters } from './core/units';
import { SPECIALS } from './weapons/defs';

// A pillar that circles orbitCenter. angle is where it starts (radians); speed is
// radians per second in phase 1, sped up while its spikes are out.
export type OrbitDef = { readonly radius: Meters; readonly angle: number; readonly speed: number };

export type ArenaLayout = {
  readonly pillars: readonly (readonly [number, number])[];
  // Index into pillars the boss starts on top of, or -1 to start on the ground.
  readonly perch: number;
  readonly bossStart: readonly [number, number];
  readonly playerStart: readonly [number, number];
  // Where the weapons you didn't bring are laid out at the start: the basics,
  // then the arena's special.
  readonly weaponSpots: readonly (readonly [number, number])[];
  readonly boss: BossDef;
  readonly orbitCenter: readonly [number, number];
  readonly orbiting: readonly OrbitDef[];
};

export const PILLAR_RADIUS = meters(1.4);
export const PILLAR_HEIGHT = meters(3.2);

// Arena 1, always: the Warden, the tutorial for slams, cones and jumps.
export const WARDEN_ARENA: ArenaLayout = {
  pillars: [[-9, -5], [9, -5], [-9, 7], [9, 7]],
  perch: -1,
  bossStart: [0, -8],
  playerStart: [0, 12],
  weaponSpots: [[-4, 9], [4, 9], [0, 9], [8, 12]],
  boss: WARDEN,
  orbitCenter: [0, 0],
  orbiting: [],
};

// The Grinder: one fixed perch the Unchained drops from, and four pillars
// circling the middle, so cover never stays put. The ring leaves a clear lane
// inside it and outside it; the player starts outside, by the weapons.
export const GRINDER: ArenaLayout = {
  pillars: [[0, -4]],
  perch: 0,
  bossStart: [0, -4],
  playerStart: [0, 13],
  weaponSpots: [[-4, 15], [4, 15], [0, 16], [8, 15]],
  boss: UNCHAINED,
  orbitCenter: [0, -1],
  orbiting: [
    { radius: meters(9), angle: Math.PI / 4, speed: 0.35 },
    { radius: meters(9), angle: (3 * Math.PI) / 4, speed: 0.35 },
    { radius: meters(9), angle: (5 * Math.PI) / 4, speed: 0.35 },
    { radius: meters(9), angle: (7 * Math.PI) / 4, speed: 0.35 },
  ],
};

// The Keeper's hall, the last arena, always: a centre perch and two rings of
// pillars turning opposite ways, so the gaps in the cover open and close.
export const FINAL_ARENA: ArenaLayout = {
  pillars: [[0, 0]],
  perch: 0,
  bossStart: [0, 0],
  playerStart: [0, 16],
  weaponSpots: [[-4, 17.5], [4, 17.5], [0, 18], [8, 17.5]],
  boss: FINAL,
  orbitCenter: [0, 0],
  orbiting: [
    { radius: meters(7), angle: 0, speed: 0.3 },
    { radius: meters(7), angle: Math.PI, speed: 0.3 },
    { radius: meters(12), angle: Math.PI / 2, speed: -0.22 },
    { radius: meters(12), angle: (3 * Math.PI) / 2, speed: -0.22 },
  ],
};

// The bosses a run draws its middle arenas from.
export const POOL: readonly ArenaLayout[] = [GRINDER];

// Decided with the user: the Warden, four drawn from the pool, then the final boss.

// How much each arena deeper adds: hp and pace. The Warden, at depth 0, is untouched.
const HP_PER_DEPTH = 0.3;
const PACE_PER_DEPTH = 0.08;

// special: the special weapon kind the arena keeps stocked, 0 for none.
export type PlannedArena = { readonly layout: ArenaLayout; readonly boss: BossDef; readonly depth: number; readonly special: number };

// A key apart from the arena draws', so adding specials never changes which bosses a seed meets.
const SPECIAL_KEY = 1000;

// The tutorial keeps to the basics; every arena after it, the final too, stocks
// one special, drawn from the seed like the bosses, without moving the drop RNG.
export function specialFor(seed: number, arena: number): number {
  if (arena <= 1) return 0;
  return SPECIALS[Math.floor(hashDraw(seed, SPECIAL_KEY + arena) * SPECIALS.length)];
}

// Which pool entry each middle arena draws, from the seed alone, never the same
// one twice in a row when the pool has a choice.
function drawn(seed: number, arena: number): ArenaLayout {
  let last = -1;
  let pick = 0;
  for (let a = 2; a <= arena; a++) {
    pick = Math.floor(hashDraw(seed, a) * POOL.length);
    if (pick === last && POOL.length > 1) pick = (pick + 1) % POOL.length;
    last = pick;
  }
  return POOL[pick];
}

// Arena `arena` in the run with this seed, the final boss's if `final`: its
// layout, and its boss scaled to the depth, so a final taken later is tougher.
// Which arena is the final is the run's decision; the draw for the others
// depends only on the seed and the arena, so the fork never changes it.
// `layout` overrides the draw, to compare one boss at different depths.
export function arenaFor(seed: number, arena: number, final: boolean, layout?: ArenaLayout): PlannedArena {
  const chosen = layout ?? (final ? FINAL_ARENA : arena === 1 ? WARDEN_ARENA : drawn(seed, arena));
  const depth = arena - 1;
  const base = chosen.boss;
  const boss: BossDef = {
    ...base,
    hp: hp(Math.round(base.hp * (1 + HP_PER_DEPTH * depth))),
    pace: base.pace * (1 + PACE_PER_DEPTH * depth),
  };
  return { layout: chosen, boss, depth, special: specialFor(seed, arena) };
}

// The doors through the north wall: corridors the player may enter only while
// the run has opened them. Stepping past enterZ is entering one. The onward door
// is the old tunnel, centred; the final door opens beside it when you're ready.
export const DOORS = { halfWidth: 2.2, depth: 6, enterZ: 3, onward: { x: 0 }, final: { x: 10 } } as const;
