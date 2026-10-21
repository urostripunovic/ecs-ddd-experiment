import { beforeEach, describe, expect, it } from 'vitest';
import {
  Ammo, Arena, C, Health, Item, Jump, PlayerInput, RewardPickup, RunStatus, RunView, Transform, Wielder,
} from '../../ecs/components';
import { send } from '../../ecs/core/outbox';
import { add, has, indexOf, isLive, NOBODY, query, world, type EntityId } from '../../ecs/core/world';
import { tunnelSystem } from '../../ecs/systems/tunnel';
import { stockSystem } from '../../ecs/systems/weapons';
import { WeaponKind } from '../../ecs/weapons/defs';
import { addPerk, Perk, perkSlots } from '../../ecs/systems/perks';
import { rewardSensorSystem } from '../../ecs/systems/rewards';
import { buf } from '../../ecs/core/buffers';
import { domainStep } from '../dispatch';
import { idMap } from '../id-map';
import { bossIdFor } from '../ids';
import { startRun, type RunHandles } from '../spawn';
import { store } from '../store';
import { readTickLog } from '../tick-log';

const countKind = (kind: number) => {
  let n = 0;
  for (let e = 0; e < world.nextFresh; e++) if (world.inUse[e] && has(e as EntityId, C.Item) && Item.kind[e] === kind) n++;
  return n;
};

const pedestals = () => query(buf, C.RewardPickup);

describe('run flow', () => {
  let h: RunHandles;
  beforeEach(() => { h = startRun(); });

  // Beats each boss and takes each tunnel until the run's last arena.
  const toLastArena = () => {
    while (store.run.arena < store.run.arenas) {
      send('EntityDowned', h.boss, h.player, 0);
      domainStep();
      Transform.z[indexOf(h.player)] = -(Arena.half + 4);
      tunnelSystem();
      domainStep();
    }
  };

  // Uses up the revives the run starts with, so the next down is the last.
  const spendRevives = () => {
    while (store.run.revives > 0) {
      send('EntityDowned', h.player, h.boss, 0);
      domainStep();
    }
  };

  it('going down with a revive left gets you back up where you fell, at full hp', () => {
    const p = indexOf(h.player);
    Transform.x[p] = 6;
    Health.hp[p] = 0;
    send('EntityDowned', h.player, h.boss, 0);
    domainStep();
    expect(RunView).toMatchObject({ status: RunStatus.Fighting, revives: 2 });
    expect(has(p, C.Dead)).toBe(false);
    expect(Health.hp[p]).toBe(Health.max[p]);
    expect(Transform.x[p]).toBe(6);
  });

  it('the player going down on the last life loses the run', () => {
    spendRevives();
    expect(store.run.revives).toBe(0);
    send('EntityDowned', h.player, h.boss, 0);
    domainStep();
    expect(RunView.status).toBe(RunStatus.Lost);
  });

  it('clearing a boss puts three rewards on pedestals; stepping on one takes it, and the rest go', () => {
    send('EntityDowned', h.boss, h.player, 0);
    domainStep();
    expect(pedestals()).toBe(3);
    const offer = store.run.offer!;
    const p = indexOf(h.player);
    const first = buf[0] as EntityId;
    Transform.x[p] = Transform.x[first];
    Transform.z[p] = Transform.z[first];
    rewardSensorSystem();
    domainStep();
    expect(readTickLog().some((line) => line.includes(`RewardTaken`) && line.includes(offer[RewardPickup.option[first]]))).toBe(true);
    expect(store.run.offer).toBeNull();
    expect(pedestals()).toBe(0);
    expect(has(p, C.RewardPending)).toBe(false);
  });

  it('a reward choice the run refuses still releases the pedestal latch', () => {
    const p = indexOf(h.player);
    // As rewardSensorSystem would, while fighting with nothing on offer.
    add(p, C.RewardPending);
    send('RewardTouched', h.player, NOBODY, 0);
    domainStep();
    expect(readTickLog().at(-1)).toContain('RewardRefused');
    expect(has(p, C.RewardPending)).toBe(false);
  });

  it('a trade on the same tick keeps the first outcome', () => {
    spendRevives();
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
    addPerk(p, Perk.LastStand);
    addPerk(p, Perk.Ricochet);

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

    // And its perks, in the order they were picked up.
    expect(store.run.loadout.perks).toEqual(['lastStand', 'ricochet']);
    expect(perkSlots(p2)).toEqual([Perk.LastStand, Perk.Ricochet, Perk.None]);

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

  // R9: in the last arena, a trade on your last life loses whichever death the
  // outbox holds first; with a revive left, the win stands and costs the revive.
  for (const bossFirst of [true, false]) {
    it(`a trade with the last boss loses the run (${bossFirst ? 'boss' : 'player'} reported first)`, () => {
      spendRevives();
      toLastArena();
      expect(RunView.arena).toBe(RunView.arenas);
      if (bossFirst) send('EntityDowned', h.boss, h.player, 0);
      send('EntityDowned', h.player, h.boss, 0);
      if (!bossFirst) send('EntityDowned', h.boss, h.player, 0);
      domainStep();
      expect(RunView.status).toBe(RunStatus.Lost);
    });
  }

  for (const bossFirst of [true, false]) {
    it(`a trade with the last boss with a revive left wins, and spends it (${bossFirst ? 'boss' : 'player'} reported first)`, () => {
      toLastArena();
      if (bossFirst) send('EntityDowned', h.boss, h.player, 0);
      send('EntityDowned', h.player, h.boss, 0);
      if (!bossFirst) send('EntityDowned', h.boss, h.player, 0);
      domainStep();
      expect(RunView).toMatchObject({ status: RunStatus.Won, revives: 2 });
    });
  }
});
