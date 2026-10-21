// What revives and rewards do to the world. The run decides when you revive
// and which reward you took; the bridge calls these to make it so.
import {
  Armor, C, Health, Knockback, RewardPickup, Revive, Team, TeamId, Transform, Velocity,
} from '../components';
import { buf, helperBuf } from '../core/buffers';
import { send } from '../core/outbox';
import { after, inTicks, seconds } from '../core/units';
import { add, despawn, entityAt, mask, NOBODY, query, remove, toHandle, type EntityId } from '../core/world';
import { WeaponKind } from '../weapons/defs';
import { armorPlates, MAX_PLATES } from './armor';
import { giveWeapon } from './weapons';

export const RewardKind = { None: 0, Revive: 1, Armor: 2, Heal: 3, Scattergun: 4 } as const;

export const REVIVE_SHIELD = inTicks(seconds(2));
// Enemy bullets this close are cleared when you get back up.
const REVIVE_CLEAR_RADIUS = 6;
const PICKUP_RADIUS = 1.3;

const ENEMY_SHOTS = mask(C.Projectile, C.Transform, C.Team);
const PEDESTALS = mask(C.RewardPickup, C.Transform);
const CHOOSERS = mask(C.PlayerControlled, C.Transform);
const NOT_CHOOSING = mask(C.Dead, C.RewardPending);

// Back up where you fell, at full hp, untouchable for a moment, with the bullets
// that would have hit you on the spot gone.
export function revivePlayer(player: EntityId): void {
  remove(player, C.Dead);
  Health.hp[player] = Health.max[player];
  Revive.shieldUntil[player] = after(REVIVE_SHIELD);
  Velocity.x[player] = Velocity.z[player] = 0;
  Knockback.until[player] = 0;
  const n = query(helperBuf, ENEMY_SHOTS);
  for (let i = 0; i < n; i++) {
    const shot = entityAt(helperBuf, i);
    if (Team.id[shot] !== TeamId.Enemy) continue;
    const d = Math.hypot(Transform.x[shot] - Transform.x[player], Transform.z[shot] - Transform.z[player]);
    if (d <= REVIVE_CLEAR_RADIUS) despawn(shot);
  }
}

// reads player Transform, RewardPickup | writes RewardPending; sends RewardTouched
// Stepping on a pedestal chooses it. Latched until the run answers, so one step
// is one choice however long you stand there.
export function rewardSensorSystem(): void {
  const pedestals = query(helperBuf, PEDESTALS);
  if (pedestals === 0) return;
  const n = query(buf, CHOOSERS, NOT_CHOOSING);
  for (let i = 0; i < n; i++) {
    const player = entityAt(buf, i);
    for (let j = 0; j < pedestals; j++) {
      const pedestal = entityAt(helperBuf, j);
      const d = Math.hypot(Transform.x[pedestal] - Transform.x[player], Transform.z[pedestal] - Transform.z[player]);
      if (d > PICKUP_RADIUS) continue;
      add(player, C.RewardPending);
      send('RewardTouched', toHandle(player), NOBODY, RewardPickup.option[pedestal]);
      break;
    }
  }
}

// The offer is closed: every pedestal goes, and the latch is released.
export function clearRewards(player: EntityId): void {
  const n = query(helperBuf, mask(C.RewardPickup));
  for (let i = n - 1; i >= 0; i--) despawn(entityAt(helperBuf, i));
  remove(player, C.RewardPending);
}

// What taking a reward does to the world. A revive changes only the run's count.
export function applyReward(player: EntityId, kind: number): void {
  switch (kind) {
    case RewardKind.Armor:
      if (armorPlates(player) < MAX_PLATES) Armor.gained[player]++;
      return;
    case RewardKind.Heal:
      Health.hp[player] = Health.max[player];
      return;
    case RewardKind.Scattergun:
      giveWeapon(player, WeaponKind.Scattergun);
      return;
    default:
      return;
  }
}
