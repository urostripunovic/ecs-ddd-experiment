import { beforeEach, describe, expect, it } from 'vitest';
import { RunViewWritable } from '../components/run-view';
import { PILLAR_RADIUS } from '../arenas';
import { WARDEN } from '../bosses/defs';
import {
  C, Cutscene, Health, PlayerInput, resetRunState, RunStatus, Slam, Slowed, Transform, Velocity,
} from '../components';
import { hp, inSeconds } from '../core/units';
import { add, resetWorld, world, type EntityId } from '../core/world';
import { spawnBoss, spawnPillar, spawnPlayer } from '../prefabs';
import { slamSystem } from './boss';
import { DODGE_COOLDOWN, DODGE_TICKS, PLAYER_SPEED } from './motion';
import { slowed } from './status';
import { stepper } from '../tick-order';

let p: EntityId;
let b: EntityId;

const tick = stepper(['inputSystem', 'movementSystem', 'bodyCollisionSystem']);
function step(n = 1): void {
  for (let i = 0; i < n; i++) tick();
}

const dodge = () => { PlayerInput.dodgePresses++; };

// A slam from the boss, landing next tick centred on the player.
function slamOnPlayer(slowFor: number): void {
  add(b, C.Slam);
  Slam.timer[b] = 1;
  Slam.radius[b] = 3;
  Slam.dmg[b] = 30;
  Slam.slowFor[b] = slowFor;
  Slam.x[b] = Transform.x[p];
  Slam.z[b] = Transform.z[p];
}

beforeEach(() => {
  resetWorld();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  p = spawnPlayer(0, 0);
  b = spawnBoss({ ...WARDEN, hp: hp(1000) }, 0, -10);
});

describe('dodge', () => {
  it('dashes well past walking speed in the move direction, then stops', () => {
    PlayerInput.moveX = 1;
    dodge();
    step(DODGE_TICKS);
    const dashed = Transform.x[p];
    expect(dashed).toBeGreaterThan(2.5);
    expect(dashed).toBeGreaterThan(PLAYER_SPEED * inSeconds(DODGE_TICKS) * 2);
    PlayerInput.moveX = 0;
    step();
    expect(Velocity.x[p]).toBe(0);
  });

  it('standing still, dodges where you aim', () => {
    Object.assign(PlayerInput, { moveX: 0, moveZ: 0, aimX: 0, aimZ: 1 });
    dodge();
    step(DODGE_TICKS);
    expect(Transform.z[p]).toBeGreaterThan(2.5);
    expect(Transform.x[p]).toBeCloseTo(0);
  });

  it('waits out its cooldown, and acts on each press once', () => {
    PlayerInput.moveX = 1;
    dodge();
    step(DODGE_TICKS);
    dodge(); // still cooling down: used up, not saved for later
    step();
    expect(Velocity.x[p]).toBe(PLAYER_SPEED);
    step(DODGE_COOLDOWN);
    expect(Velocity.x[p]).toBe(PLAYER_SPEED);
    dodge();
    step();
    expect(Velocity.x[p]).toBeGreaterThan(PLAYER_SPEED * 2);
  });

  it('a press during a cutscene is dropped, not replayed when it ends', () => {
    PlayerInput.moveX = 1;
    Cutscene.until = world.tick + 30;
    dodge();
    step(31);
    expect(Velocity.x[p]).toBe(PLAYER_SPEED);
  });

  it('is invulnerable while dodging: a jump landing takes no hp and doesn\'t slow', () => {
    PlayerInput.moveX = 1;
    dodge();
    step();
    slamOnPlayer(60);
    slamSystem();
    expect(Health.hp[p]).toBe(100);
    expect(slowed(p)).toBe(false);
  });

  it('passes through the boss, but not through pillars', () => {
    Transform.x[b] = 2;
    Transform.z[b] = 0;
    PlayerInput.moveX = 1;
    dodge();
    step(DODGE_TICKS);
    expect(Transform.x[p]).toBeGreaterThan(2);

    // Out of the way, so only the pillar is in the path.
    Transform.x[b] = -10;
    PlayerInput.moveX = 0;
    step(DODGE_COOLDOWN);
    const pillar = spawnPillar(Transform.x[p] + 2, 0, PILLAR_RADIUS);
    PlayerInput.moveX = 1;
    dodge();
    step(DODGE_TICKS);
    expect(Transform.x[p]).toBeLessThan(Transform.x[pillar]);
  });
});

describe('slam slow', () => {
  it('the stamp hurts but doesn\'t slow', () => {
    slamOnPlayer(0);
    slamSystem();
    expect(Health.hp[p]).toBe(70);
    expect(slowed(p)).toBe(false);
  });

  it('a jump landing hurts and slows', () => {
    slamOnPlayer(60);
    slamSystem();
    expect(Health.hp[p]).toBe(70);
    expect(slowed(p)).toBe(true);
    expect(Slowed.until[p]).toBe(world.tick + 60);
  });
});
