import { describe, expect, it } from 'vitest';
import { Action, JUMP_AIR, JUMP_CROUCH, JUMP_RECOVER, ROAR_HOLD, ROAR_REAR } from '../../ecs/systems/boss-actions';
import { bossPose } from './boss-pose';

describe('boss pose', () => {
  it('a jump crouches on the ground, peaks mid-air and lands back at zero', () => {
    expect(bossPose(Action.Jump, JUMP_CROUCH - 1, 0).height).toBe(0);
    expect(bossPose(Action.Jump, JUMP_CROUCH - 1, 0).sy).toBeLessThan(1);
    const peak = bossPose(Action.Jump, JUMP_CROUCH + JUMP_AIR / 2, 0).height;
    expect(peak).toBeGreaterThan(4);
    expect(bossPose(Action.Jump, JUMP_CROUCH + JUMP_AIR, 0).height).toBe(0);
    expect(bossPose(Action.Jump, JUMP_CROUCH + JUMP_AIR + JUMP_RECOVER, 0)).toMatchObject({ sx: 1, sy: 1 });
  });

  it('a roar rears back, lunges, and settles exactly to rest', () => {
    expect(bossPose(Action.Roar, ROAR_REAR - 1, 0).lean).toBeLessThan(0);
    expect(bossPose(Action.Roar, ROAR_REAR + 1, 0).lean).toBeGreaterThan(0);
    expect(bossPose(Action.Roar, ROAR_REAR + ROAR_HOLD, 0)).toEqual({ height: 0, sx: 1, sy: 1, lean: 0 });
  });

  it('is at rest when idle', () => {
    expect(bossPose(Action.Idle, 50, 0)).toEqual({ height: 0, sx: 1, sy: 1, lean: 0 });
  });
});

describe('procedural moves', () => {
  it('a charge leans back through its windup, forward as it runs, and reels while stunned', () => {
    expect(bossPose(Action.Charge, 20, 0, 0, 40).lean).toBeLessThan(0);
    expect(bossPose(Action.Charge, 45, 0, 0, 40).lean).toBeGreaterThan(0.3);
    const reel = [0, 5, 10].map((t) => bossPose(Action.Charge, 60 + t, 0, 0, 40, true).sy);
    expect(new Set(reel).size).toBeGreaterThan(1);
  });

  it('a generated windup sets when the cone stops rearing back', () => {
    expect(bossPose(Action.Cone, 18, 0, 0, 22).lean).toBeLessThan(0);
    expect(bossPose(Action.Cone, 23, 0, 0, 22).lean).toBeGreaterThan(0);
  });
});
