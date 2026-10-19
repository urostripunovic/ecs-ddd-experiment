// Components: data only, structure of arrays, indexed by EntityId.
import { MAX } from '../core/world';

export { C } from './tags';

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
// throwSeen/interactSeen: the PlayerInput press counts this wielder has acted on.
// The app only ever increments the counts and the ECS only writes the seen
// values, so a press is never lost or doubled whatever the frame rate.
export const Wielder = {
  held: new Int32Array(MAX), cooldown: new Float32Array(MAX), swing: new Uint8Array(MAX),
  throwSeen: new Int32Array(MAX), interactSeen: new Int32Array(MAX),
};

// Items are entities, so a thrown gun keeps its ammo and a dropped sword its wear.
// pickupAt is the first tick it can be picked up again, so a dropped or landed
// item isn't grabbed straight back.
export const Item = { kind: new Uint8Array(MAX), pickupAt: new Uint32Array(MAX) };
export const Durability = { value: new Float32Array(MAX) };
// reload is seconds left; the magazine refills when it reaches 0.
export const Ammo = { count: new Uint16Array(MAX), reload: new Float32Array(MAX) };
// by is the thrower's Handle; dmg is fixed at release so a buff ending mid-flight doesn't change it.
export const Thrown = { by: new Int32Array(MAX), dmg: new Float32Array(MAX), ticksLeft: new Uint16Array(MAX) };

// host is a Handle; angle is where around the host it went in, so it rides there.
export const StuckIn = { host: new Int32Array(MAX), angle: new Float32Array(MAX) };

export const BuffPickup = { kind: new Uint8Array(MAX) };
// Tick deadlines rather than countdowns: written once on pickup, read by
// whoever needs the effect, and nothing has to decrement them.
export const Buffs = { hasteUntil: new Uint32Array(MAX), furyUntil: new Uint32Array(MAX) };
export const Slowed = { until: new Uint32Array(MAX), factor: new Float32Array(MAX) };

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
};
// The one action a boss is doing (see systems/boss-actions.ts). last* is what
// it did before, so the chain-gap table can decide when the next may start.
export const BossAction = {
  kind: new Uint8Array(MAX), startedAt: new Uint32Array(MAX),
  lastKind: new Uint8Array(MAX), lastEnd: new Uint32Array(MAX),
};
// Ticks of the current jump, for the renderer's arc.
export const Jump = { airStart: new Uint32Array(MAX), landAt: new Uint32Array(MAX) };
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
// throwPresses/interactPresses only ever count up (see Wielder.throwSeen).
export const PlayerInput = {
  moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, reload: false, throwPresses: 0, interactPresses: 0,
};
// A read model of the domain's match state, written only by the match projector.
export const MatchStatus = { Fighting: 0, Won: 1, Lost: 2 } as const;
export const MatchView = { status: 0 as number, endedAt: 0 };
export const Arena = { half: 20 };

const perEntity = [
  Transform, Velocity, Health, Hurt, LastHit, Wielder, Item, Durability, Ammo, Thrown, BuffPickup, Buffs, Slowed,
  StuckIn, Team, Projectile, Collider, BossPhase, Slam, BossAction, Jump, Pressure, Shape,
];

export function resetComponents(): void {
  for (const group of perEntity) for (const arr of Object.values(group)) arr.fill(0);
  Object.assign(PlayerInput, {
    moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, reload: false, throwPresses: 0, interactPresses: 0,
  });
  MatchView.status = MatchStatus.Fighting;
  MatchView.endedAt = 0;
}
