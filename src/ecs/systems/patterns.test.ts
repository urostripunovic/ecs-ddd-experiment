import { beforeEach, describe, expect, it } from 'vitest';

import { UNCHAINED } from '../bosses/defs';
import { C, Health, Pattern, resetArenaState, resetRunState, RunStatus, Transform, Velocity } from '../components';
import { RunViewWritable } from '../components/run-view';
import { buf } from '../core/buffers';
import { hp, inSeconds, inTicks, seconds, ticks } from '../core/units';
import { query, resetWorld, world, type EntityId } from '../core/world';
import { spawnBoss, spawnPlayer } from '../prefabs';
import { RING_WAVE_GAP } from './boss-actions';
import { ring, RING_GAPS, RING_GAP_HALF, RING_SPEED, RING_TURN } from './boss-scripts';
import { projectileSystem } from './combat';
import { movementSystem, PLAYER_SPEED } from './motion';

const DT = inSeconds(ticks(1));
let boss: EntityId;
let player: EntityId;

beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  RunViewWritable.status = RunStatus.Fighting;
  boss = spawnBoss({ ...UNCHAINED, hp: hp(100_000) }, 0, 0);
  player = spawnPlayer(0, 6);
});

// Runs one ring of `waves` waves, then lets the bullets fly past the player.
function fireRing(waves: number, gapAt: number, holdPlayer: () => void): void {
  const script = ring(boss, waves, gapAt, 1);
  for (let i = 0; i < 400; i++) {
    if (!script.next().done) { /* still firing */ }
    holdPlayer();
    movementSystem(DT);
    projectileSystem(DT);
    world.tick++;
  }
}

const at = (angle: number, r = 6) => () => {
  Transform.x[player] = Math.cos(angle) * r;
  Transform.z[player] = Math.sin(angle) * r;
};

describe('the gap ring', () => {
  it('misses a player standing in a telegraphed gap', () => {
    const gapAt = Math.PI / 2; // straight at the player's start
    fireRing(1, gapAt, at(gapAt));
    expect(Health.hp[player]).toBe(100);
  });

  it('hits a player standing between the gaps', () => {
    const gapAt = Math.PI / 2;
    fireRing(1, gapAt, at(gapAt + Math.PI / 3));
    expect(Health.hp[player]).toBeLessThan(100);
  });

  it('shows the floor telegraph exactly where the bullets leave gaps', () => {
    const script = ring(boss, 1, 1.0, 1);
    script.next();
    expect(Pattern.gapAt[boss]).toBeCloseTo(1.0, 5);
    expect(Pattern.gapHalf[boss]).toBeCloseTo(RING_GAP_HALF, 5);
    for (let i = 0; i < 200 && query(buf, C.Projectile) === 0; i++) script.next();
    const n = query(buf, C.Projectile);
    expect(n).toBeGreaterThan(20);
    for (let i = 0; i < n; i++) {
      const e = buf[i] as EntityId;
      const a = Math.atan2(Velocity.z[e], Velocity.x[e]);
      for (let k = 0; k < RING_GAPS; k++) {
        const gap = 1.0 + (k * 2 * Math.PI) / RING_GAPS;
        const off = Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap)));
        expect(off).toBeGreaterThanOrEqual(RING_GAP_HALF);
      }
    }
  });

  it('leaves a safe spot shared by every wave in the air at once', () => {
    // At 6 m: the waves still flying when the telegraph moves on, plus the one it shows.
    const flight = inTicks(seconds(6 / RING_SPEED));
    const waves = Math.ceil(flight / RING_WAVE_GAP) + 1;
    const shared = (2 * RING_GAP_HALF - (waves - 1) * RING_TURN) * 6;
    // The player (0.45 m) plus a bullet (0.2 m) on each side.
    expect(shared).toBeGreaterThan(2 * (0.45 + 0.2));
  });

  it('can be followed on foot: walking to each new gap at walking speed never gets hit', () => {
    const gapAt = Math.PI / 2;
    at(gapAt)();
    fireRing(3, gapAt, () => {
      // Walks along the circle to the middle of the waves still in play (the
      // shown one and the two before it), no faster than the player can.
      const now = Math.atan2(Transform.z[player], Transform.x[player]);
      const target = Pattern.gapAt[boss] - RING_TURN;
      const diff = Math.atan2(Math.sin(target - now), Math.cos(target - now));
      const most = (PLAYER_SPEED * DT) / 6;
      at(now + Math.max(-most, Math.min(most, diff)))();
    });
    expect(Health.hp[player]).toBe(100);
  });
});
