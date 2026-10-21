import { beforeEach, describe, expect, it } from 'vitest';
import {
  Ammo, Arena, C, Health, Item, Jump, PlayerInput, RunStatus, RunView, Transform, Wielder,
} from '../../ecs/components';
import { send } from '../../ecs/core/outbox';
import { has, indexOf, isLive, NOBODY, world, type EntityId } from '../../ecs/core/world';
import { tunnelSystem } from '../../ecs/systems/tunnel';
import { stockSystem } from '../../ecs/systems/weapons';
import { WeaponKind } from '../../ecs/weapons/defs';
import { domainStep } from '../dispatch';
import { idMap } from '../id-map';
import { bossIdFor } from '../ids';
import { startRun, type RunHandles } from '../spawn';
import { store } from '../store';
import { readTickLog } from '../tick-log';

const countKind = (kind: number) => {
  let n = 0;
  for (let e = 0; e < world.nextFresh; e++) if (world.alive[e] && has(e as EntityId, C.Item) && Item.kind[e] === kind) n++;
  return n;
};

describe('run flow', () => {
  let h: RunHandles;
  beforeEach(() => { h = startRun(); });

  it('the player going down loses the run', () => {
    send('EntityDowned', h.player, h.boss, 0);
    domainStep();
    expect(RunView.status).toBe(RunStatus.Lost);
  });

  it('a trade on the same tick keeps the first outcome', () => {
    send('EntityDowned', h.player, h.boss, 0);
    send('EntityDowned', h.boss, NOBODY, 0);
    domainStep();
    expect(RunView.status).toBe(RunStatus.Lost);
  });

  it('starts with the gun from the run\'s starting loadout', () => {
    const held = Wielder.held[indexOf(h.player)];
    expect(Item.kind[indexOf(held as never)]).toBe(WeaponKind.Gun);
  });

  it('the tunnel stays shut while fighting, and a refused entry releases the latch', () => {
    expect(RunView.tunnelOpen).toBe(false);
    send('TunnelEntered', h.player, NOBODY, 0);
    domainStep();
    expect(readTickLog().at(-1)).toContain('TunnelRefused -> latch released (NotCleared)');
    expect(has(indexOf(h.player), C.TunnelPending)).toBe(false);
  });

  it('clearing arena 1 and walking into the tunnel builds arena 2 from what the run carried', () => {
    const p = indexOf(h.player);
    const gun = indexOf(Wielder.held[p] as never);
    Health.hp[p] = 61;
    Ammo.count[gun] = 7;

    send('EntityDowned', h.boss, h.player, 0);
    domainStep();
    expect(RunView).toMatchObject({ status: RunStatus.Cleared, tunnelOpen: true });

    // Cleared means nothing new spawns, even with a weapon missing.
    const before = countKind(WeaponKind.Gun) + countKind(WeaponKind.Sword) + countKind(WeaponKind.Spear);
    for (let i = 0; i < 600; i++) { stockSystem(); world.tick++; }
    expect(countKind(WeaponKind.Gun) + countKind(WeaponKind.Sword) + countKind(WeaponKind.Spear)).toBe(before);

    Transform.z[p] = -(Arena.half + 4);
    tunnelSystem();
    domainStep();

    expect(RunView).toMatchObject({ arena: 2, status: RunStatus.Fighting, tunnelOpen: false });
    expect(isLive(h.player)).toBe(true); // the same handles object now points into arena 2
    const p2 = indexOf(h.player);
    expect(Health.hp[p2]).toBe(61);
    const gun2 = indexOf(Wielder.held[p2] as never);
    expect(Item.kind[gun2]).toBe(WeaponKind.Gun);
    expect(Ammo.count[gun2]).toBe(7);
    // It got a stable name when it crossed, and keeps it in the new arena.
    expect(idMap.refOf(Wielder.held[p2] as never)).toMatchObject({ context: 'weapon' });
    expect(store.run.loadout.weapon?.id).toBe((idMap.refOf(Wielder.held[p2] as never) as { id: string }).id);

    // Still one of each: the carried gun counts toward the stock.
    expect([countKind(WeaponKind.Gun), countKind(WeaponKind.Sword), countKind(WeaponKind.Spear)]).toEqual([1, 1, 1]);

    // The same Warden, new to the rules, waiting on its perch.
    const b2 = indexOf(h.boss);
    expect(idMap.refOf(h.boss)).toEqual({ context: 'boss', id: bossIdFor(2) });
    expect(store.bosses.get(bossIdFor(2))).toMatchObject({ defeated: false });
    expect(has(b2, C.Airborne)).toBe(true);
    expect(Jump.fromHeight[b2]).toBeGreaterThan(0);
  });

  it('presses from arena 1 are not replayed in arena 2', () => {
    PlayerInput.throwReleases = 5;
    send('EntityDowned', h.boss, h.player, 0);
    domainStep();
    Transform.z[indexOf(h.player)] = -(Arena.half + 4);
    tunnelSystem();
    domainStep();
    expect(Wielder.throwSeen[indexOf(h.player)]).toBe(5);
  });

  // R9: in the last arena, a trade loses whichever death the outbox holds first.
  for (const bossFirst of [true, false]) {
    it(`a trade with the last boss loses the run (${bossFirst ? 'boss' : 'player'} reported first)`, () => {
      send('EntityDowned', h.boss, h.player, 0);
      domainStep();
      Transform.z[indexOf(h.player)] = -(Arena.half + 4);
      tunnelSystem();
      domainStep();
      expect(RunView.arena).toBe(2);
      if (bossFirst) send('EntityDowned', h.boss, h.player, 0);
      send('EntityDowned', h.player, h.boss, 0);
      if (!bossFirst) send('EntityDowned', h.boss, h.player, 0);
      domainStep();
      expect(RunView.status).toBe(RunStatus.Lost);
    });
  }
});
