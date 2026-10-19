import { describe, expect, it } from 'vitest';
import { follow, type Follow } from './camera';

describe('camera follow', () => {
  it('eases toward a moving player', () => {
    const cam: Follow = { x: 0, z: 0, focus: 5 };
    follow(cam, 5, 10, 0, 1 / 60);
    expect(cam.x).toBeGreaterThan(0);
    expect(cam.x).toBeLessThan(10);
  });

  it('snaps when the player is a new entity: a new arena or a restart, not a walk across the map', () => {
    const cam: Follow = { x: 0, z: -24, focus: 5 };
    follow(cam, 9, 0, 10, 1 / 60);
    expect(cam).toEqual({ x: 0, z: 10, focus: 9 });
  });
});
