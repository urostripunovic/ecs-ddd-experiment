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

// cooldown and reload are seconds left; ammo refills when reload reaches 0.
export const Weapon = {
  ammo: new Uint16Array(MAX), mag: new Uint16Array(MAX),
  rate: new Float32Array(MAX), cooldown: new Float32Array(MAX),
  reload: new Float32Array(MAX), reloadTime: new Float32Array(MAX),
  dmg: new Float32Array(MAX),
};
export const Team = { id: new Uint8Array(MAX) };
export const TeamId = { Player: 0, Enemy: 1, Neutral: 2 } as const;
// owner holds a Handle.
export const Projectile = { owner: new Int32Array(MAX), dmg: new Float32Array(MAX), life: new Float32Array(MAX) };
export const Collider = { radius: new Float32Array(MAX) };

// phase: written only by the projector (domain-owned truth).
// running: which phase's coroutine the ECS has started; 0 after a load, so
// the saved phase restarts its choreography from the beginning.
export const BossPhase = { phase: new Uint8Array(MAX), running: new Uint8Array(MAX) };
// timer counts down in ticks; the hit lands when it reaches 0.
export const Slam = {
  timer: new Uint16Array(MAX), windup: new Uint16Array(MAX),
  radius: new Float32Array(MAX), dmg: new Float32Array(MAX),
};

export const ShapeKind = { None: 0, Player: 1, Boss: 2, Bullet: 3, EnemyBullet: 4, Pillar: 5 } as const;
export const Shape = { kind: new Uint8Array(MAX) };

// Singletons: one local player, one match, one arena.
export const PlayerInput = { moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, reload: false };
// A read model of the domain's match state, written only by the match projector.
export const MatchStatus = { Fighting: 0, Won: 1, Lost: 2 } as const;
export const MatchView = { status: 0 as number, endedAt: 0 };
export const Arena = { half: 20 };

const perEntity = [
  Transform, Velocity, Health, Hurt, LastHit, Weapon, Team, Projectile, Collider, BossPhase, Slam, Shape,
];

export function resetComponents(): void {
  for (const group of perEntity) for (const arr of Object.values(group)) arr.fill(0);
  Object.assign(PlayerInput, { moveX: 0, moveZ: 0, aimX: 0, aimZ: -1, fire: false, reload: false });
  MatchView.status = MatchStatus.Fighting;
  MatchView.endedAt = 0;
}
