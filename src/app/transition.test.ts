import { describe, expect, it } from 'vitest';
import { domainStep } from '../bridge/dispatch';
import { buildArena, handles, startRun } from '../bridge/spawn';
import { store } from '../bridge/store';
import {
  Arena, ARENA_STATE, C, Health, LastHit, PlayerInput, Projectile, RUN_STATE, RunStatus, RunView, ShapeKind, StuckIn, TeamId,
  Thrown, Transform, Wielder,
} from '../ecs/components';
import { send } from '../ecs/core/outbox';
import { restoreRng, rngState } from '../ecs/core/rng';
import { hp, seconds } from '../ecs/core/units';
import { spawnProjectile } from '../ecs/prefabs';
import { has, indexOf, NO_HANDLE, world, type Handle } from '../ecs/core/world';
import { tunnelSystem } from '../ecs/systems/tunnel';
import { tick } from './loop';

// Fields that hold handles. Generations are run-lifetime on purpose (they keep
// growing so stale handles stay stale), so handles are compared by slot.
const HANDLE_FIELDS = new Set<unknown>([Wielder.held, LastHit.by, Thrown.by, StuckIn.host, Projectile.owner]);
const slotOf = (h: number) => (h === NO_HANDLE ? -1 : indexOf(h as Handle));

function snapshot(groups: Record<string, object>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, group] of Object.entries(groups)) {
    for (const [field, value] of Object.entries(group)) {
      const key = `${name}.${field}`;
      if (ArrayBuffer.isView(value)) {
        const arr = Array.from(value as Float32Array);
        out[key] = HANDLE_FIELDS.has(value) ? arr.map(slotOf) : arr;
      } else out[key] = value;
    }
  }
  return out;
}

function worldShape() {
  return {
    mask: Array.from(world.mask), alive: Array.from(world.alive),
    nextFresh: world.nextFresh, freeCount: world.freeCount, tick: world.tick,
  };
}

// Plays arena 1 for real (bullets, drops, the roar's cutscene and shake, stuck
// and broken weapons), then walks into the tunnel.
function playIntoArenaTwo(): void {
  startRun({ bossHp: 400, seed: 3 });
  Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
  while (RunView.status === RunStatus.Fighting && world.tick < 3000) tick();
  expect(RunView.status).toBe(RunStatus.Cleared);
  PlayerInput.fire = false;
  for (let i = 0; i < 20; i++) tick(); // leave some state mid-flight
  const p = indexOf(handles.player);
  Transform.x[p] = 0;
  Transform.z[p] = -(Arena.half + 4);
  tunnelSystem();
  domainStep();
  expect(RunView.arena).toBe(2);
}

describe('moving to the next arena', () => {
  it('gives the same world as building that arena fresh from the same domain and run state', () => {
    playIntoArenaTwo();
    const played = { arena: snapshot(ARENA_STATE), run: snapshot(RUN_STATE), world: worldShape() };
    const run = store.run;
    const tickAt = world.tick;
    const input = { ...PlayerInput };
    const rng = rngState();

    // Fresh: a new run that never played arena 1, given only the domain state
    // and the values declared to live for the whole run.
    startRun({ bossHp: 400, seed: 3 });
    store.run = run;
    world.tick = tickAt;
    Object.assign(PlayerInput, input);
    restoreRng(rng);
    buildArena(run.arena, run.loadout);
    const fresh = { arena: snapshot(ARENA_STATE), run: snapshot(RUN_STATE), world: worldShape() };

    expect(fresh).toEqual(played);
  });

  // R8: a bullet already in flight when the boss dies can't undo the clear.
  it('nothing hurts you once the arena is cleared, so you can always reach the tunnel', () => {
    const h = startRun();
    const p = indexOf(h.player);
    send('EntityDowned', h.boss, h.player, 0);
    domainStep();
    Health.hp[p] = 5;
    spawnProjectile(Transform.x[p], Transform.z[p] - 1, 0, 1, 16, TeamId.Enemy, h.boss, hp(10), seconds(2), ShapeKind.EnemyBullet);
    for (let i = 0; i < 10; i++) tick();
    expect(Health.hp[p]).toBe(5);
    expect(has(p, C.Dead)).toBe(false);

    Transform.x[p] = 0;
    Transform.z[p] = -(Arena.half + 4);
    tick();
    expect(RunView.arena).toBe(2);
  });
});
