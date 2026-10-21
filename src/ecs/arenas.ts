// Arena layouts as data. The run (domain) decides which arena you're in; what
// that arena looks like is simulation detail, so it lives here.
import { UNCHAINED, WARDEN, type BossDef } from './bosses/defs';
import { meters, type Meters } from './core/units';

// A pillar that circles orbitCenter. angle is where it starts (radians); speed is
// radians per second in phase 1, sped up while its spikes are out.
export type OrbitDef = { readonly radius: Meters; readonly angle: number; readonly speed: number };

export type ArenaLayout = {
  readonly pillars: readonly (readonly [number, number])[];
  // Index into pillars the boss starts on top of, or -1 to start on the ground.
  readonly perch: number;
  readonly bossStart: readonly [number, number];
  readonly playerStart: readonly [number, number];
  // Where the weapons you didn't bring are laid out at the start.
  readonly weaponSpots: readonly (readonly [number, number])[];
  readonly boss: BossDef;
  readonly orbitCenter: readonly [number, number];
  readonly orbiting: readonly OrbitDef[];
};

export const PILLAR_RADIUS = meters(1.4);
export const PILLAR_HEIGHT = meters(3.2);

// Indexed by arena number - 1.
export const ARENAS: readonly ArenaLayout[] = [
  {
    pillars: [[-9, -5], [9, -5], [-9, 7], [9, 7]],
    perch: -1,
    bossStart: [0, -8],
    playerStart: [0, 12],
    weaponSpots: [[-4, 9], [4, 9], [0, 9]],
    boss: WARDEN,
    orbitCenter: [0, 0],
    orbiting: [],
  },
  {
    // The Grinder: one fixed perch the Unchained drops from, and four pillars
    // circling the middle, so cover never stays put. The ring leaves a clear lane
    // inside it and outside it; the player starts outside, by the weapons.
    pillars: [[0, -4]],
    perch: 0,
    bossStart: [0, -4],
    playerStart: [0, 13],
    weaponSpots: [[-4, 15], [4, 15], [0, 16]],
    boss: UNCHAINED,
    orbitCenter: [0, -1],
    orbiting: [
      { radius: meters(9), angle: Math.PI / 4, speed: 0.35 },
      { radius: meters(9), angle: (3 * Math.PI) / 4, speed: 0.35 },
      { radius: meters(9), angle: (5 * Math.PI) / 4, speed: 0.35 },
      { radius: meters(9), angle: (7 * Math.PI) / 4, speed: 0.35 },
    ],
  },
];

// The tunnel through the north wall: a corridor the player may enter only
// while it's open. Stepping past ENTER_Z is entering it.
export const TUNNEL = { halfWidth: 2.2, depth: 6, enterZ: 3 } as const;
