// Arena layouts as data. The run (domain) decides which arena you're in; what
// that arena looks like is simulation detail, so it lives here.

export type ArenaLayout = {
  readonly pillars: readonly (readonly [number, number])[];
  // Index into pillars the boss starts on top of, or -1 to start on the ground.
  readonly perch: number;
  readonly bossStart: readonly [number, number];
  readonly playerStart: readonly [number, number];
  // Where the weapons you didn't bring are laid out at the start.
  readonly weaponSpots: readonly (readonly [number, number])[];
};

export const PILLAR_RADIUS = 1.4;
export const PILLAR_HEIGHT = 3.2;

// Indexed by arena number - 1.
export const ARENAS: readonly ArenaLayout[] = [
  {
    pillars: [[-9, -5], [9, -5], [-9, 7], [9, 7]],
    perch: -1,
    bossStart: [0, -8],
    playerStart: [0, 12],
    weaponSpots: [[-4, 9], [4, 9], [0, 9]],
  },
  {
    // A tighter ring with a centre perch the Warden drops from. Close enough to
    // the player's start that the camera sees the entrance.
    pillars: [[0, -6], [-11, -1], [11, -1], [-6, 9], [6, 9]],
    perch: 0,
    bossStart: [0, -6],
    playerStart: [0, 10],
    weaponSpots: [[-4, 13], [4, 13], [0, 14]],
  },
];

// The tunnel through the north wall: a corridor the player may enter only
// while it's open. Stepping past ENTER_Z is entering it.
export const TUNNEL = { halfWidth: 2.2, depth: 6, enterZ: 3 } as const;
