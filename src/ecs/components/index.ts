// Components: data only, structure of arrays, indexed by EntityId.
import { MAX_ENTITIES, onDespawn, toHandle, world, type ComponentMask, type EntityId } from '../core/world';

import { RunViewWritable } from './run-view';
import { C } from './tags';

export { C };

// px/py/pz hold the position at the start of the tick, so rendering can
// interpolate between two ticks instead of snapping at 60 Hz.
export const Transform = {
  x: new Float32Array(MAX_ENTITIES), y: new Float32Array(MAX_ENTITIES), z: new Float32Array(MAX_ENTITIES),
  px: new Float32Array(MAX_ENTITIES), py: new Float32Array(MAX_ENTITIES), pz: new Float32Array(MAX_ENTITIES),
};
export const Velocity = { x: new Float32Array(MAX_ENTITIES), y: new Float32Array(MAX_ENTITIES), z: new Float32Array(MAX_ENTITIES) };

export const Health = { hp: new Float32Array(MAX_ENTITIES), max: new Float32Array(MAX_ENTITIES) };
// Ticks of hit flash left. Game feel only, so it never leaves the ECS.
export const Hurt = { flash: new Uint8Array(MAX_ENTITIES) };
// Handles are plain numbers in an Int32Array, like the input counters. Declaring
// them here, not in a comment, lets tools (the god menu's inspector) tell
// "points at Gun #6" from a count, without a second list to keep in step.
// countsWhile is the tag a row needs for its cell to mean anything: a reused row
// keeps its last occupant's cells, and those leftovers point at nothing on purpose.
const HANDLE_FIELDS = new WeakMap<Int32Array, ComponentMask>();
function handleField(countsWhile: ComponentMask): Int32Array {
  const a = new Int32Array(MAX_ENTITIES);
  HANDLE_FIELDS.set(a, countsWhile);
  return a;
}
export const holdsHandles = (field: unknown): boolean => field instanceof Int32Array && HANDLE_FIELDS.has(field);

// Remembered so the downed command can say who downed whom.
export const LastHit = { by: handleField(C.Health) };

// held: NOBODY means fists. cooldown is seconds until the next attack;
// swing is ticks of attack animation left, for the renderer.
// throwSeen/interactSeen: the PlayerInput release/press counts this wielder has
// acted on. The app only ever increments the counts and the ECS only writes the
// seen values, so an input is never lost or doubled whatever the frame rate.
// charge: ticks the throw has been held, capped at CHARGE_MAX_TICKS.
export const Wielder = {
  held: handleField(C.Wielder), cooldown: new Float32Array(MAX_ENTITIES), swing: new Uint8Array(MAX_ENTITIES),
  throwSeen: new Int32Array(MAX_ENTITIES), interactSeen: new Int32Array(MAX_ENTITIES), charge: new Uint8Array(MAX_ENTITIES),
};

// Items are entities, so a thrown gun keeps its ammo and a dropped sword its wear.
// pickupAt is the first tick it can be picked up again, so a dropped or landed
// item isn't grabbed straight back.
export const Item = { kind: new Uint8Array(MAX_ENTITIES), pickupAt: new Uint32Array(MAX_ENTITIES) };
export const Durability = { value: new Float32Array(MAX_ENTITIES) };
// reload is seconds left; the magazine refills when it reaches 0.
export const Ammo = { count: new Uint16Array(MAX_ENTITIES), reload: new Float32Array(MAX_ENTITIES) };
// by is the thrower; dmg and wearMul are fixed at release, so a buff
// ending mid-flight doesn't change what the throw does.
export const Thrown = {
  by: handleField(C.Flying), dmg: new Float32Array(MAX_ENTITIES), wearMul: new Float32Array(MAX_ENTITIES), ticksLeft: new Uint16Array(MAX_ENTITIES),
};

// angle is where around the host it went in, so it rides there.
export const StuckIn = { host: handleField(C.Stuck), angle: new Float32Array(MAX_ENTITIES) };

export const BuffPickup = { kind: new Uint8Array(MAX_ENTITIES) };
// Tick deadlines rather than countdowns: written once on pickup, read by
// whoever needs the effect, and nothing has to decrement them.
export const Buffs = { hasteUntil: new Uint32Array(MAX_ENTITIES), furyUntil: new Uint32Array(MAX_ENTITIES) };
export const Slowed = { until: new Uint32Array(MAX_ENTITIES), factor: new Float32Array(MAX_ENTITIES) };
// A dash. until: when it ends; readyAt: when the next may start; x/z: its
// direction, fixed at the start. seen: the PlayerInput.dodgePresses this player
// has acted on, so a press is never lost or doubled (see Wielder.throwSeen).
export const Dodge = {
  until: new Uint32Array(MAX_ENTITIES), readyAt: new Uint32Array(MAX_ENTITIES),
  x: new Float32Array(MAX_ENTITIES), z: new Float32Array(MAX_ENTITIES), seen: new Int32Array(MAX_ENTITIES),
};
// A shove in m/s until a tick. Its own field: inputSystem stays the only
// writer of a player's velocity and adds this on top.
export const Knockback = { x: new Float32Array(MAX_ENTITIES), z: new Float32Array(MAX_ENTITIES), until: new Uint32Array(MAX_ENTITIES) };

export const Team = { id: new Uint8Array(MAX_ENTITIES) };
export const TeamId = { Player: 0, Enemy: 1, Neutral: 2 } as const;
export const Projectile = { owner: handleField(C.Projectile), dmg: new Float32Array(MAX_ENTITIES), life: new Float32Array(MAX_ENTITIES) };
export const Collider = { radius: new Float32Array(MAX_ENTITIES) };

// phase: which stage of the fight, written only by bossThresholdSystem.
// running: which phase's coroutine has been started, so a new phase starts its
// choreography from the beginning.
export const BossPhase = { phase: new Uint8Array(MAX_ENTITIES), running: new Uint8Array(MAX_ENTITIES) };
// timer counts down in ticks; the hit lands at x/z when it reaches 0. The
// centre is stored rather than read from the boss, so a jump can telegraph
// where it will land while the boss is still in the air.
export const Slam = {
  timer: new Uint16Array(MAX_ENTITIES), windup: new Uint16Array(MAX_ENTITIES),
  radius: new Float32Array(MAX_ENTITIES), dmg: new Float32Array(MAX_ENTITIES),
  x: new Float32Array(MAX_ENTITIES), z: new Float32Array(MAX_ENTITIES),
  // Ticks the hit slows whoever it lands on; 0 = no slow.
  slowFor: new Uint16Array(MAX_ENTITIES),
};
// The one action a boss is doing (see systems/boss-actions.ts). last* is what
// it did before, so the chain-gap table can decide when the next may start.
export const BossAction = {
  kind: new Uint8Array(MAX_ENTITIES), startedAt: new Uint32Array(MAX_ENTITIES),
  lastKind: new Uint8Array(MAX_ENTITIES), lastEnd: new Uint32Array(MAX_ENTITIES),
};
// Ticks of the current jump, for the renderer's arc. fromHeight is non-zero
// when it leaves from up high, like the Warden dropping off its perch.
export const Jump = { airStart: new Uint32Array(MAX_ENTITIES), landAt: new Uint32Array(MAX_ENTITIES), fromHeight: new Float32Array(MAX_ENTITIES) };
// How much hp the boss lost over the last second, and when it may evade again.
export const Pressure = {
  hpMark: new Float32Array(MAX_ENTITIES), markedAt: new Uint32Array(MAX_ENTITIES),
  recentLoss: new Float32Array(MAX_ENTITIES), evadeReadyAt: new Uint32Array(MAX_ENTITIES),
};

export const ShapeKind = {
  None: 0, Player: 1, Boss: 2, Bullet: 3, EnemyBullet: 4, Pillar: 5,
  Sword: 6, Spear: 7, Gun: 8, Haste: 9, Fury: 10,
} as const;
export const Shape = { kind: new Uint8Array(MAX_ENTITIES) };

// Singletons: one local player, one match, one arena.
// throwReleases/interactPresses/dodgePresses only ever count up (see Wielder.throwSeen).
// throwHeld charges the gauge; the release is what throws.
export const PlayerInput = {
  moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, reload: false,
  throwHeld: false, throwReleases: 0, interactPresses: 0, dodgePresses: 0,
};
// A read model of the domain's run: read-only here, written only by the bridge
// through run-view.ts. Cleared: the boss is down, the tunnel may be open, and
// nothing spawns or hurts; the player still moves.
export const RunStatus = { Fighting: 0, Won: 1, Lost: 2, Cleared: 3 } as const;
export const RunView: Readonly<typeof RunViewWritable> = RunViewWritable;
export const Arena = { half: 20 };
// While a cutscene runs the player can't act; until is a tick deadline.
export const Cutscene = { until: 0 };
// 0..1. The camera shakes by trauma squared; decays per tick so it lasts the
// same at any frame rate. The wobble itself is the renderer's business.
export const Shake = { trauma: 0 };
// Dev-only cheats the simulation honours (see app/dev/commands.ts). Run lifetime,
// so they survive entering the next arena; a restart clears them. cheated marks
// a run any cheat touched, so a bug report says so.
export const GodMode = { invulnerable: false, keepWeapons: false, freezeBoss: false, cheated: false };
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
export const RUN_STATE = { PlayerInput, RunView, GodMode };
export const CONSTANTS = { C, TeamId, ShapeKind, RunStatus, Arena };

// A note must be cleared before the row it points at is freed, as breakItem does.
// Otherwise only isLive stands between it and whatever takes the row next: skip
// that check once and you throw a sword that broke, or a bullet. Dev builds and
// tests fail at the despawn that leaves one behind, naming both ends; release
// builds compile this away.
const NOTES = Object.entries(ARENA_STATE).flatMap(([component, group]) =>
  Object.entries(group).flatMap(([field, column]) => {
    const countsWhile = column instanceof Int32Array ? HANDLE_FIELDS.get(column) : undefined;
    return countsWhile === undefined ? [] : [{ name: `${component}.${field}`, column: column as Int32Array, countsWhile }];
  }));
const SHAPE_NAMES = Object.fromEntries(Object.entries(ShapeKind).map(([name, kind]) => [kind, name]));
const nameOf = (e: number) => `${Shape.kind[e] ? SHAPE_NAMES[Shape.kind[e]] : 'entity'} #${e}`;

function failOnNotesTo(entity: EntityId): void {
  const h = toHandle(entity);
  for (const { name, column, countsWhile } of NOTES) {
    for (let r = 0; r < world.nextFresh; r++) {
      if (r === entity || !world.alive[r] || (world.signature[r] & countsWhile) !== countsWhile || column[r] !== h) continue;
      throw new Error(`row ${entity} freed while ${name}[${r}] still points at it (${nameOf(entity)}, from ${nameOf(r)}). Clear the note first, as breakItem does.`);
    }
  }
}
if (import.meta.env.DEV) onDespawn(failOnNotesTo);

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
