// The railgun and the flamethrower: charged beams that bloom, and fire that keeps burning.
import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import {
  Ammo, Burn, C, Durability, Health, PlayerInput, resetArenaState, resetRunState, RunStatus, 
  Tracer, Transform, Wielder,
} from '../components';
import { buf } from '../core/buffers';
import { hp, inSeconds, inTicks, seconds } from '../core/units';
import { despawn, entityAt, query, resetWorld, world, type EntityId } from '../core/world';
import { PILLAR_RADIUS } from '../arenas';
import { WARDEN } from '../bosses/defs';
import { spawnBoss, spawnPillar, spawnPlayer, spawnWeapon } from '../prefabs';
import { CHARGE_MAX_TICKS, throwCharge } from '../weapons/charge';
import {
  BURN_TICKS, RAIL_BLOOM_MAX, WEAPONS, WeaponKind,
} from '../weapons/defs';
import { railBloom } from '../weapons/charge';
import {
  equip, heldItem, 
  
} from './weapons';
import { stepper } from '../tick-order';

const PERFECT_TICKS = 44;
const PERFECT = throwCharge(PERFECT_TICKS / CHARGE_MAX_TICKS);

const step = stepper(['snapshotSystem', 'inputSystem', 'movementSystem', 'bodyCollisionSystem', 'heldFollowSystem', 'stuckFollowSystem', 'throwSystem', 'attackSystem', 'flightSystem', 'returnSystem', 'pickupSystem', 'burnSystem', 'durabilitySystem', 'tracerSystem']);

// Holds fire for some ticks, then lets go, as the input layer counts it.
function fireAfter(holdTicks: number): void {
  PlayerInput.fire = true;
  for (let i = 0; i < holdTicks; i++) step();
  PlayerInput.fire = false;
  PlayerInput.fireReleases++;
  step();
}

let p: EntityId;
let b: EntityId;
beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  p = spawnPlayer(0, 0);
  b = spawnBoss({ ...WARDEN, hp: hp(1000) }, 0, -6);
  Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: false, throwHeld: false, moveX: 0, moveZ: 0 });
});

describe('railgun', () => {
  const railgun = () => {
    const gun = spawnWeapon(WeaponKind.Railgun, 0, 0);
    equip(p, gun);
    return gun;
  };

  it('holding fire charges; nothing leaves until you let go', () => {
    railgun();
    PlayerInput.fire = true;
    for (let i = 0; i < 30; i++) step();
    expect(Health.hp[b]).toBe(1000);
    expect(Wielder.fireCharge[p]).toBe(30);
  });

  it('let go in the perfect zone, one beam pierces everything in its line', () => {
    const gun = railgun();
    const behind = spawnBoss({ ...WARDEN, hp: hp(1000) }, 0, -12);
    fireAfter(PERFECT_TICKS);
    const dmg = WEAPONS[WeaponKind.Railgun].dmg * PERFECT.dmgMul;
    expect(Health.hp[b]).toBeCloseTo(1000 - dmg, 3);
    expect(Health.hp[behind]).toBeCloseTo(1000 - dmg, 3);
    expect(Ammo.count[gun]).toBe(WEAPONS[WeaponKind.Railgun].mag - 1);
    // The beam is drawn for a moment, then gone.
    expect(query(buf, C.Tracer)).toBe(1);
    for (let i = 0; i < 30; i++) step();
    expect(query(buf, C.Tracer)).toBe(0);
  });

  it('a pillar stops the beam', () => {
    railgun();
    spawnPillar(0, -3, PILLAR_RADIUS);
    fireAfter(PERFECT_TICKS);
    expect(Health.hp[b]).toBe(1000);
  });

  // The user's call: like hip-fire, holding too long doesn't stop the shot, it
  // throws it off line, the more the further into the overcharge.
  it('overcharged, it still fires at full power, but blooms off your aim', () => {
    const angles: number[] = [];
    for (let shot = 0; shot < 30; shot++) {
      const gun = railgun();
      Ammo.count[gun] = 3;
      fireAfter(CHARGE_MAX_TICKS + 10);
      const n = query(buf, C.Tracer);
      const beam = entityAt(buf, n - 1);
      angles.push(Math.atan2(Tracer.z1[beam] - Transform.z[beam], Tracer.x1[beam] - Transform.x[beam]) + Math.PI / 2);
      for (let i = n - 1; i >= 0; i--) despawn(entityAt(buf, i));
    }
    for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual(RAIL_BLOOM_MAX + 1e-6);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(RAIL_BLOOM_MAX / 2);
  });

  it('blooms wider the further into the overcharge, and never inside the perfect zone', () => {
    expect(railBloom(PERFECT_TICKS / CHARGE_MAX_TICKS)).toBe(0);
    expect(railBloom(0.85)).toBeGreaterThan(0);
    expect(railBloom(1)).toBeGreaterThan(railBloom(0.85));
    expect(railBloom(1)).toBe(RAIL_BLOOM_MAX);
  });

  it('a bloomed shot hits as hard as a perfect one', () => {
    railgun();
    // Point blank, so even a wide bloom goes through the boss.
    Transform.z[b] = -1.9;
    fireAfter(CHARGE_MAX_TICKS + 10);
    expect(Health.hp[b]).toBeCloseTo(1000 - WEAPONS[WeaponKind.Railgun].dmg * PERFECT.dmgMul, 3);
  });

  it('never fires while venting or reloading', () => {
    const gun = railgun();
    Ammo.reload[gun] = 1;
    fireAfter(PERFECT_TICKS);
    expect(Health.hp[b]).toBe(1000);
  });
});

describe('flamethrower', () => {
  it('sets what is in the cone burning, and it keeps burning a while after you stop', () => {
    Transform.z[b] = -3;
    equip(p, spawnWeapon(WeaponKind.Flamethrower, 0, 0));
    PlayerInput.fire = true;
    step();
    PlayerInput.fire = false;
    expect(Burn.until[b]).toBeGreaterThan(world.tick);
    for (let i = 0; i < BURN_TICKS + 5; i++) step();
    // One touch of the flame: the whole burn, from the tick it caught.
    expect(1000 - Health.hp[b]).toBeCloseTo(WEAPONS[WeaponKind.Flamethrower].dmg * inSeconds(BURN_TICKS), 0);
    const after = Health.hp[b];
    step();
    expect(Health.hp[b]).toBe(after);
  });

  it('out of reach, nothing catches', () => {
    Transform.z[b] = -12;
    equip(p, spawnWeapon(WeaponKind.Flamethrower, 0, 0));
    PlayerInput.fire = true;
    for (let i = 0; i < 20; i++) step();
    expect(Health.hp[b]).toBe(1000);
  });

  it('burns fuel while it sprays, and runs dry', () => {
    const flamer = spawnWeapon(WeaponKind.Flamethrower, 0, 0);
    equip(p, flamer);
    PlayerInput.fire = true;
    for (let i = 0; i < inTicks(seconds(1)); i++) step();
    const used = WEAPONS[WeaponKind.Flamethrower].durability - Durability.value[flamer];
    expect(used).toBeGreaterThan(10);
    for (let i = 0; i < inTicks(seconds(12)) && heldItem(p) !== -1; i++) step();
    expect(heldItem(p)).toBe(-1);
  });
});
