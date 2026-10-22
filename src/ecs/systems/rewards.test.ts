import { beforeEach, describe, expect, it } from 'vitest';

import { Rng } from '../core/rng';
import { WARDEN } from '../bosses/defs';
import {
  Ammo, Armor, C, Health, PlayerInput, resetArenaState, resetRunState, RunStatus, TeamId, Transform,
} from '../components';
import { RunViewWritable } from '../components/run-view';
import { buf } from '../core/buffers';
import { clearOutbox, outbox } from '../core/outbox';
import { hp, inSeconds, seconds, ticks } from '../core/units';
import { add, has, query, resetWorld, toHandle, world, type EntityId } from '../core/world';
import { spawnBoss, spawnPlayer, spawnProjectile, spawnReward, spawnWeapon } from '../prefabs';
import { WEAPONS, WeaponKind } from '../weapons/defs';
import { hurt } from './damage';
import { armorPlates, MAX_PLATES } from './armor';
import { revivePlayer, REVIVE_SHIELD, RewardKind, rewardSensorSystem } from './rewards';
import { attackSystem, equip } from './weapons';

let player: EntityId;
let boss: EntityId;
beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  clearOutbox();
  RunViewWritable.status = RunStatus.Fighting;
  player = spawnPlayer(0, 0);
  boss = spawnBoss({ ...WARDEN, hp: hp(1000) }, 0, -10);
});

describe('armor plates', () => {
  it('each blocks one hit completely, then breaks', () => {
    Armor.gained[player] = 2;
    expect(hurt(player, 30, toHandle(boss))).toBe(false);
    expect(hurt(player, 30, toHandle(boss))).toBe(false);
    expect(Health.hp[player]).toBe(100);
    expect(armorPlates(player)).toBe(0);
    expect(hurt(player, 30, toHandle(boss))).toBe(true);
    expect(Health.hp[player]).toBe(70);
  });

  it('never hold more than three', () => {
    expect(MAX_PLATES).toBe(3);
  });
});

describe('revive', () => {
  it('gets you back up where you fell, at full hp, briefly untouchable', () => {
    Transform.x[player] = 5;
    Health.hp[player] = 0;
    add(player, C.Dead);
    revivePlayer(player);
    expect(has(player, C.Dead)).toBe(false);
    expect(Health.hp[player]).toBe(Health.max[player]);
    expect(Transform.x[player]).toBe(5);
    expect(hurt(player, 30, toHandle(boss))).toBe(false);
    world.tick += REVIVE_SHIELD;
    expect(hurt(player, 30, toHandle(boss))).toBe(true);
  });

  it('clears enemy bullets close by, so you aren\'t hit again the moment you stand', () => {
    const near = spawnProjectile(1, 0, 1, 0, 0, TeamId.Enemy, toHandle(boss), hp(10), seconds(4), 0);
    const far = spawnProjectile(15, 0, 1, 0, 0, TeamId.Enemy, toHandle(boss), hp(10), seconds(4), 0);
    const mine = spawnProjectile(1, 1, 1, 0, 0, TeamId.Player, toHandle(player), hp(10), seconds(4), 0);
    add(player, C.Dead);
    revivePlayer(player);
    expect(world.inUse[near]).toBe(0);
    expect(world.inUse[far]).toBe(1);
    expect(world.inUse[mine]).toBe(1);
  });
});

describe('reward pedestals', () => {
  it('stepping on one reports its option once, until the rules answer', () => {
    spawnReward(2, RewardKind.Armor, 0, 0.5);
    rewardSensorSystem();
    rewardSensorSystem();
    expect(outbox.count).toBe(1);
    expect(outbox.slots[0]).toMatchObject({ kind: 'RewardTouched', subject: toHandle(player), value: 2 });
    expect(has(player, C.RewardPending)).toBe(true);
  });

  it('report nothing while you stand clear of them', () => {
    spawnReward(0, RewardKind.Heal, 6, 6);
    rewardSensorSystem();
    expect(outbox.count).toBe(0);
  });
});

describe('the Scattergun', () => {
  it('fires a spread of pellets per shot', () => {
    const gun = spawnWeapon(WeaponKind.Scattergun, 0, 0);
    equip(player, gun);
    PlayerInput.aimX = 0;
    PlayerInput.aimZ = -1;
    PlayerInput.fire = true;
    attackSystem(inSeconds(ticks(1)), new Rng(1));
    PlayerInput.fire = false;
    const def = WEAPONS[WeaponKind.Scattergun];
    expect(def.pellets).toBeGreaterThan(1);
    expect(query(buf, C.Projectile)).toBe(def.pellets);
    expect(Ammo.count[gun]).toBe(def.mag - 1);
  });
});
