// Components: data only, structure of arrays, indexed by EntityId.
import { MAX } from '../core/world';

import { C } from './tags';

export { C };

// px/py/pz hold the position at the start of the tick, so rendering can
// interpolate between two ticks instead of snapping at 60 Hz.
export const Transform = {
  x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX),
  px: new Float32Array(MAX), py: new Float32Array(MAX), pz: new Float32Array(MAX),
};
export const Velocity = { x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX) };

export const Health = { hp: new Float32Array(MAX), max: new Float32Array(MAX) };
// Ticks of hit flash left. Game feel only, so it never leaves the ECS.
export const Hurt = { flash: new Uint8Array(MAX) };
// Remembered so the downed command can say who downed whom. Holds a Handle.
export const LastHit = { by: new Int32Array(MAX) };

// held is a Handle (NO_HANDLE = fists). cooldown is seconds until the next attack;
// swing is ticks of attack animation left, for the renderer.
// throwSeen/interactSeen: the PlayerInput release/press counts this wielder has
// acted on. The app only ever increments the counts and the ECS only writes the
// seen values, so an input is never lost or doubled whatever the frame rate.
// charge: ticks the throw has been held, capped at CHARGE_MAX_TICKS.
export const Wielder = {
  held: new Int32Array(MAX), cooldown: new Float32Array(MAX), swing: new Uint8Array(MAX),
  throwSeen: new Int32Array(MAX), interactSeen: new Int32Array(MAX), charge: new Uint8Array(MAX),
};

// Items are entities, so a thrown gun keeps its ammo and a dropped sword its wear.
// pickupAt is the first tick it can be picked up again, so a dropped or landed
// item isn't grabbed straight back.
export const Item = { kind: new Uint8Array(MAX), pickupAt: new Uint32Array(MAX) };
export const Durability = { value: new Float32Array(MAX) };
// reload is seconds left; the magazine refills when it reaches 0.
export const Ammo = { count: new Uint16Array(MAX), reload: new Float32Array(MAX) };
// by is the thrower's Handle; dmg and wearMul are fixed at release, so a buff
// ending mid-flight doesn't change what the throw does.
export const Thrown = {
  by: new Int32Array(MAX), dmg: new Float32Array(MAX), wearMul: new Float32Array(MAX), ticksLeft: new Uint16Array(MAX),
};

// host is a Handle; angle is where around the host it went in, so it rides there.
export const StuckIn = { host: new Int32Array(MAX), angle: new Float32Array(MAX) };

export const BuffPickup = { kind: new Uint8Array(MAX) };
// Tick deadlines rather than countdowns: written once on pickup, read by
// whoever needs the effect, and nothing has to decrement them.
export const Buffs = { hasteUntil: new Uint32Array(MAX), furyUntil: new Uint32Array(MAX) };
export const Slowed = { until: new Uint32Array(MAX), factor: new Float32Array(MAX) };
// A dash. until: when it ends; readyAt: when the next may start; x/z: its
// direction, fixed at the start. seen: the PlayerInput.dodgePresses this player
// has acted on, so a press is never lost or doubled (see Wielder.throwSeen).
export const Dodge = {
  until: new Uint32Array(MAX), readyAt: new Uint32Array(MAX),
  x: new Float32Array(MAX), z: new Float32Array(MAX), seen: new Int32Array(MAX),
};
// A shove in m/s until a tick. Its own field: inputSystem stays the only
// writer of a player's velocity and adds this on top.
export const Knockback = { x: new Float32Array(MAX), z: new Float32Array(MAX), until: new Uint32Array(MAX) };

export const Team = { id: new Uint8Array(MAX) };
export const TeamId = { Player: 0, Enemy: 1, Neutral: 2 } as const;
// owner holds a Handle.
export const Projectile = { owner: new Int32Array(MAX), dmg: new Float32Array(MAX), life: new Float32Array(MAX) };
export const Collider = { radius: new Float32Array(MAX) };

// phase: written only by the projector (domain-owned truth).
// running: which phase's coroutine the ECS has started; 0 after a load, so
// the saved phase restarts its choreography from the beginning.
export const BossPhase = { phase: new Uint8Array(MAX), running: new Uint8Array(MAX) };
// timer counts down in ticks; the hit lands at x/z when it reaches 0. The
// centre is stored rather than read from the boss, so a jump can telegraph
// where it will land while the boss is still in the air.
export const Slam = {
  timer: new Uint16Array(MAX), windup: new Uint16Array(MAX),
  radius: new Float32Array(MAX), dmg: new Float32Array(MAX),
  x: new Float32Array(MAX), z: new Float32Array(MAX),
  // Ticks the hit slows whoever it lands on; 0 = no slow.
  slowFor: new Uint16Array(MAX),
};
// The one action a boss is doing (see systems/boss-actions.ts). last* is what
// it did before, so the chain-gap table can decide when the next may start.
export const BossAction = {
  kind: new Uint8Array(MAX), startedAt: new Uint32Array(MAX),
  lastKind: new Uint8Array(MAX), lastEnd: new Uint32Array(MAX),
};
// Ticks of the current jump, for the renderer's arc. fromHeight is non-zero
// when it leaves from up high, like the Warden dropping off its perch.
export const Jump = { airStart: new Uint32Array(MAX), landAt: new Uint32Array(MAX), fromHeight: new Float32Array(MAX) };
// How much hp the boss lost over the last second, and when it may evade again.
export const Pressure = {
  hpMark: new Float32Array(MAX), markedAt: new Uint32Array(MAX),
  recentLoss: new Float32Array(MAX), evadeReadyAt: new Uint32Array(MAX),
};

export const ShapeKind = {
  None: 0, Player: 1, Boss: 2, Bullet: 3, EnemyBullet: 4, Pillar: 5,
  Sword: 6, Spear: 7, Gun: 8, Haste: 9, Fury: 10,
} as const;
export const Shape = { kind: new Uint8Array(MAX) };

// Singletons: one local player, one match, one arena.
// throwReleases/interactPresses/dodgePresses only ever count up (see Wielder.throwSeen).
// throwHeld charges the gauge; the release is what throws.
export const PlayerInput = {
  moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, reload: false,
  throwHeld: false, throwReleases: 0, interactPresses: 0, dodgePresses: 0,
};
// A read model of the domain's run, written only by the run projector and the
// spawn projection. Cleared: the boss is down, the tunnel may be open, and
// nothing spawns or hurts; the player still moves.
export const RunStatus = { Fighting: 0, Won: 1, Lost: 2, Cleared: 3 } as const;
export const RunView = { status: 0 as number, endedAt: 0, arena: 1, arenas: 1, tunnelOpen: false };
export const Arena = { half: 20 };
// While a cutscene runs the player can't act; until is a tick deadline.
export const Cutscene = { until: 0 };
// 0..1. The camera shakes by trauma squared; decays per tick so it lasts the
// same at any frame rate. The wobble itself is the renderer's business.
export const Shake = { trauma: 0 };
// Per weapon kind, the tick its replacement appears; 0 = nothing missing.
export const Stock = { respawnAt: new Uint32Array(4) };

// Every component and singleton says how long it lives, here and nowhere else.
// A new arena wipes ARENA_STATE; RUN_STATE carries on, on purpose; CONSTANTS
// never change. scope.test.ts fails if anything exported here is in no list or
// in two, so a new singleton can't silently leak from one arena into the next.
export const ARENA_STATE = {
  Transform, Velocity, Health, Hurt, LastHit, Wielder, Item, Durability, Ammo, Thrown, StuckIn, BuffPickup, Buffs,
  Slowed, Knockback, Dodge, Team, Projectile, Collider, BossPhase, Slam, BossAction, Jump, Pressure, Shape, Cutscene, Shake,
  Stock,
};
// The input counters must keep counting (a new player starts caught up with
// them), and RunView is the run's projection, rewritten by every build.
export const RUN_STATE = { PlayerInput, RunView };
export const CONSTANTS = { C, TeamId, ShapeKind, RunStatus, Arena };

type Group = Record<string, unknown>;

// The values each group starts with, taken before anything runs, so a reset
// restores exactly what a fresh load would have.
function initialValues(groups: Record<string, Group>): Map<Group, Group> {
  const out = new Map<Group, Group>();
  for (const g of Object.values(groups)) {
    const plain: Group = {};
    for (const [k, v] of Object.entries(g)) if (!ArrayBuffer.isView(v)) plain[k] = v;
    out.set(g, plain);
  }
  return out;
}
const ARENA_INITIAL = initialValues(ARENA_STATE);
const RUN_INITIAL = initialValues(RUN_STATE);

function reset(initial: Map<Group, Group>): void {
  for (const [g, plain] of initial) {
    for (const v of Object.values(g)) if (ArrayBuffer.isView(v)) (v as Uint8Array).fill(0);
    Object.assign(g, plain);
  }
}

// Between arenas.
export function resetArenaState(): void {
  reset(ARENA_INITIAL);
}

// A new run.
export function resetRunState(): void {
  reset(ARENA_INITIAL);
  reset(RUN_INITIAL);
}
