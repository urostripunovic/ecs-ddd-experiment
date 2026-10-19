import { describe, expect, it } from 'vitest';
import { Action, JUMP_AIR, JUMP_CROUCH, JUMP_RECOVER } from '../../ecs/systems/boss-actions';
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

  it('is at rest when idle', () => {
    expect(bossPose(Action.Idle, 50, 0)).toEqual({ height: 0, sx: 1, sy: 1, lean: 0 });
  });
});
