// Components: data only, structure of arrays, indexed by EntityId.
import { MAX_ENTITIES, onDespawn, toHandle, world, type ComponentMask, type EntityId } from '../core/world';

import { RunViewWritable } from './run-view';
import { C } from './tags';
import {
  BossPhase, Slam, BossAction, BossGen, Line, LineState, LineHit, Homing, Jump, Pressure, BossStyle, BossPace, Pattern, Stagger,
} from './boss';

export {
  BossPhase, Slam, BossAction, BossGen, Line, LineState, LineHit, Homing, Jump, Pressure, BossStyle, BossPace, Pattern, Stagger,
} from './boss';

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
// fireSeen/fireCharge: the same pair for the railgun, which charges on fire
// and shoots on the release.
export const Wielder = {
  held: handleField(C.Wielder), cooldown: new Float32Array(MAX_ENTITIES), swing: new Uint8Array(MAX_ENTITIES),
  throwSeen: new Int32Array(MAX_ENTITIES), interactSeen: new Int32Array(MAX_ENTITIES), charge: new Uint8Array(MAX_ENTITIES),
  fireSeen: new Int32Array(MAX_ENTITIES), fireCharge: new Uint8Array(MAX_ENTITIES),
  // When the current hold on throw began, so spinning a hammer too long can cost you.
  spinSince: new Uint32Array(MAX_ENTITIES),
};

// Items are entities, so a thrown gun keeps its ammo and a dropped sword its wear.
// pickupAt is the first tick it can be picked up again, so a dropped or landed
// item isn't grabbed straight back. level: the arena it was found in, set once
// when it spawns and never changed after; it scales every hit it deals.
export const Item = {
  kind: new Uint8Array(MAX_ENTITIES), pickupAt: new Uint32Array(MAX_ENTITIES), level: new Uint8Array(MAX_ENTITIES),
};
export const Durability = { value: new Float32Array(MAX_ENTITIES) };
// reload is seconds left; the magazine refills when it reaches 0.
export const Ammo = { count: new Uint16Array(MAX_ENTITIES), reload: new Float32Array(MAX_ENTITIES) };
// by is the thrower; dmg and wearMul are fixed at release, so a buff
// ending mid-flight doesn't change what the throw does.
export const Thrown = {
  by: handleField(C.Flying), dmg: new Float32Array(MAX_ENTITIES), wearMul: new Float32Array(MAX_ENTITIES), ticksLeft: new Uint16Array(MAX_ENTITIES),
  // Bounces left before it lands (Ricochet).
  bounces: new Uint8Array(MAX_ENTITIES),
  // A chakram's leg (0 out, 1 coming home) and the last thing it hit on this
  // leg, so it hits each target once going out and once coming back.
  leg: new Uint8Array(MAX_ENTITIES), lastHit: handleField(C.Flying),
};
// Burning: hurts dps hit points a second until a tick. A deadline, so spraying
// again only moves it on; by is who lit it.
export const Burn = { until: new Uint32Array(MAX_ENTITIES), dps: new Float32Array(MAX_ENTITIES), by: handleField(C.Health) };
// A railgun beam to draw: from Transform to x1/z1, gone after until.
export const Tracer = { x1: new Float32Array(MAX_ENTITIES), z1: new Float32Array(MAX_ENTITIES), until: new Uint32Array(MAX_ENTITIES) };

// angle is where around the host it went in, so it rides there.
export const StuckIn = { host: handleField(C.Stuck), angle: new Float32Array(MAX_ENTITIES) };

export const BuffPickup = { kind: new Uint8Array(MAX_ENTITIES) };
// Tick deadlines rather than countdowns: written once on pickup, read by
// whoever needs the effect, and nothing has to decrement them.
export const Buffs = { hasteUntil: new Uint32Array(MAX_ENTITIES), furyUntil: new Uint32Array(MAX_ENTITIES) };
export const Slowed = { until: new Uint32Array(MAX_ENTITIES), factor: new Float32Array(MAX_ENTITIES) };
// Dizzy after a hammer breaks mid-spin: until a tick, your feet wander toward
// angle, which turns a little at random every tick.
export const Dizzy = { until: new Uint32Array(MAX_ENTITIES), angle: new Float32Array(MAX_ENTITIES) };
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

export const ShapeKind = {
  None: 0, Player: 1, Boss: 2, Bullet: 3, EnemyBullet: 4, Pillar: 5,
  Sword: 6, Spear: 7, Gun: 8, Haste: 9, Fury: 10, Perk: 11, HeavyBullet: 12, Reward: 13, Scattergun: 14,
  Chakram: 15, Warhammer: 16, Railgun: 17, Flamethrower: 18, RailBeam: 19, Orb: 20,
} as const;
export const Shape = { kind: new Uint8Array(MAX_ENTITIES) };
// A pillar on a circle: centre, radius, where it is on it now (radians) and how
// fast it goes round (radians per second, negative for clockwise).
export const Orbit = {
  cx: new Float32Array(MAX_ENTITIES), cz: new Float32Array(MAX_ENTITIES), radius: new Float32Array(MAX_ENTITIES),
  angle: new Float32Array(MAX_ENTITIES), speed: new Float32Array(MAX_ENTITIES),
  // A push from a hammer or a railgun: extra radians per second, fading out by
  // kickUntil, so the pillar settles back to its own pace.
  kick: new Float32Array(MAX_ENTITIES), kickUntil: new Uint32Array(MAX_ENTITIES),
};
// The tick a pillar's spikes came out, so the renderer can grow them in.
export const Spikes = { since: new Uint32Array(MAX_ENTITIES) };
// The first tick spikes may hurt this entity again: one hit per touch, not one per tick.
export const SpikeHit = { readyAt: new Uint32Array(MAX_ENTITIES) };
// Three perk slots, oldest first; 0 is empty (see Perk).
export const Perks = { s0: new Uint8Array(MAX_ENTITIES), s1: new Uint8Array(MAX_ENTITIES), s2: new Uint8Array(MAX_ENTITIES) };
export const PerkPickup = { kind: new Uint8Array(MAX_ENTITIES) };
// When the next perk may drop; 0 until the arena schedules its first.
export const PerkDrop = { nextAt: 0 };
// Plates = gained - broken: the bridge grants them, a hit breaks one, so each
// field has one writer and neither can erase the other.
export const Armor = { gained: new Uint8Array(MAX_ENTITIES), broken: new Uint8Array(MAX_ENTITIES) };
// Untouchable until this tick after getting back up.
export const Revive = { shieldUntil: new Uint32Array(MAX_ENTITIES) };
// option: its index in the run's offer; kind: RewardKind, for the look and the effect.
export const RewardPickup = { option: new Uint8Array(MAX_ENTITIES), kind: new Uint8Array(MAX_ENTITIES) };

// Singletons: one local player, one match, one arena.
// throwReleases/interactPresses/dodgePresses only ever count up (see Wielder.throwSeen).
// throwHeld charges the gauge; the release is what throws.
export const PlayerInput = {
  moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, reload: false,
  throwHeld: false, throwReleases: 0, interactPresses: 0, dodgePresses: 0, fireReleases: 0,
};
// A read model of the domain's run: read-only here, written only by the bridge
// through RunViewWritable. Cleared: the boss is down, the tunnel may be open, and
// nothing spawns or hurts; the player still moves.
export const RunStatus = { Fighting: 0, Won: 1, Lost: 2, Cleared: 3 } as const;
export const RunView: Readonly<typeof RunViewWritable> = RunViewWritable;
export const Arena = { half: 20 };
// While a cutscene runs the player can't act; until is a tick deadline.
export const Cutscene = { until: 0 };
// 0..1. The camera shakes by trauma squared; decays per tick so it lasts the
// same at any frame rate. The wobble itself is the renderer's business.
export const Shake = { trauma: 0 };
// Dev-only cheats the simulation honours (see DevCommand). Run lifetime,
// so they survive entering the next arena; a restart clears them. cheated marks
// a run any cheat touched, so a bug report says so.
export const GodMode = { invulnerable: false, keepWeapons: false, freezeBoss: false, cheated: false };
// Per weapon kind, the tick its replacement appears; 0 = nothing missing.
// special: the one special weapon kind this arena keeps on top of the basics, 0 for none.
export const Stock = { respawnAt: new Uint32Array(16), special: 0 };

// Every component and singleton says how long it lives, here and nowhere else.
// A new arena wipes ARENA_STATE; RUN_STATE carries on, on purpose; CONSTANTS
// never change. A test fails if anything exported here is in no list or in
// two, so a new singleton can't silently leak from one arena into the next.
export const ARENA_STATE = {
  Transform, Velocity, Health, Hurt, LastHit, Wielder, Item, Durability, Ammo, Thrown, Burn, Tracer, StuckIn, BuffPickup, Buffs,
  Slowed, Dizzy, Knockback, Dodge, Team, Projectile, Collider, BossPhase, Slam, BossAction, Jump, Pressure, Shape, Cutscene, Shake,
  Stock, BossStyle, BossPace, BossGen, Line, LineHit, Homing, Stagger, Pattern, Orbit, Spikes, SpikeHit, Perks, PerkPickup, PerkDrop, Armor, Revive, RewardPickup,
};
// The input counters must keep counting (a new player starts caught up with
// them), and RunView is the run's projection, rewritten by every build.
export const RUN_STATE = { PlayerInput, RunView, GodMode };
export const CONSTANTS = { C, TeamId, ShapeKind, RunStatus, Arena, LineState };

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
      if (r === entity || !world.inUse[r] || (world.signature[r] & countsWhile) !== countsWhile || column[r] !== h) continue;
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
