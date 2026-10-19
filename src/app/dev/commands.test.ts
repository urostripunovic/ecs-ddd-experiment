import { beforeEach, describe, expect, it } from 'vitest';
import { disagreements } from '../../bridge/run/agree';
import { handles, startRun } from '../../bridge/spawn';
import { store } from '../../bridge/store';
import { readTickLog } from '../../bridge/tick-log';
import {
  Ammo, BossPhase, C, GodMode, Health, Item, PlayerInput, RunStatus, RunView, Transform, Wielder,
} from '../../ecs/components';
import { has, indexOf, isLive, NO_HANDLE, world, type Handle } from '../../ecs/core/world';
import { WeaponKind } from '../../ecs/weapons/defs';
import { createFrameDriver, tick, timeControl } from '../loop';
import { clearDev, devHistory, inspect, nameOf, queueDev, replayDev, type DevCommand } from './commands';

const player = () => indexOf(handles.player);
const boss = () => indexOf(handles.boss);
const held = () => indexOf(Wielder.held[player()] as Handle);
const run = (n: number) => { for (let i = 0; i < n; i++) tick(); };
const cheat = (cmd: DevCommand) => { queueDev(cmd); tick(); };

beforeEach(() => {
  startRun({ seed: 3 });
  clearDev();
  Object.assign(PlayerInput, { moveX: 0, moveZ: 0, fire: false, aimX: 0, aimZ: -1 });
  Object.assign(timeControl, { paused: false, steps: 0, scale: 1 });
});

describe('debug cheats: forced simulation data', () => {
  it('invulnerable: hits flash but take no hp', () => {
    cheat({ kind: 'god', flag: 'invulnerable', on: true });
    const before = Health.hp[player()];
    Transform.x[player()] = Transform.x[boss()];
    Transform.z[player()] = Transform.z[boss()] + 2;
    run(600); // the Warden slams and shoots point blank
    expect(Health.hp[player()]).toBe(before);
  });

  it('keep weapons: firing uses no ammo', () => {
    cheat({ kind: 'god', flag: 'keepWeapons', on: true });
    const ammo = Ammo.count[held()];
    PlayerInput.fire = true;
    run(60);
    expect(Ammo.count[held()]).toBe(ammo);
  });

  it('freeze boss: it stops moving and starts nothing new', () => {
    cheat({ kind: 'god', flag: 'freezeBoss', on: true });
    const x = Transform.x[boss()];
    const z = Transform.z[boss()];
    run(300);
    expect([Transform.x[boss()], Transform.z[boss()]]).toEqual([x, z]);
  });

  it('give: the new weapon is in hand, the old one on the ground', () => {
    const gun = held();
    cheat({ kind: 'give', weapon: 'spear' });
    expect(Item.kind[held()]).toBe(WeaponKind.Spear);
    expect(has(gun, C.Grounded)).toBe(true);
  });

  it('inspect: only per-entity fields, all of them numbers', () => {
    const fields = inspect(handles.player);
    expect(fields).toContainEqual({ component: 'Health', field: 'hp', value: 100 });
    expect(fields.every((f) => typeof f.value === 'number' && !Number.isNaN(f.value))).toBe(true);
    expect(fields.some((f) => f.component === 'Stock')).toBe(false);
  });

  it('inspect: a field holding a handle names the entity it points at', () => {
    const held = inspect(handles.player).find((f) => f.component === 'Wielder' && f.field === 'held');
    expect(held?.points).toBe(Wielder.held[player()]);
    expect(nameOf(held!.points!)).toBe(`Gun #${indexOf(held!.points!)}`);
    expect(inspect(handles.player).find((f) => f.field === 'cooldown')?.points).toBeUndefined();
  });

  it('nameOf: nobody and a dead entity are said so, not shown as a number', () => {
    expect(nameOf(NO_HANDLE)).toBe('none');
    const gun = Wielder.held[player()] as Handle;
    cheat({ kind: 'give', weapon: 'spear' });
    expect(nameOf(gun)).toMatch(/^Gun #\d+$/); // dropped, still alive
    startRun({ seed: 3 });
    expect(nameOf(gun)).toMatch(/^gone #\d+$/);
  });

  it('set: the inspector writes one field of one entity', () => {
    cheat({ kind: 'set', entity: handles.player, component: 'Health', field: 'hp', value: 42 });
    expect(Health.hp[player()]).toBe(42);
  });
});

describe('gameplay cheats: through the rules', () => {
  it('kill boss: the death sensor and the rules do the rest', () => {
    cheat({ kind: 'killBoss' });
    expect(RunView.status).toBe(RunStatus.Cleared);
    expect(store.bosses.get('warden' as never)?.defeated).toBe(true);
    expect(readTickLog().some((l) => l.includes('BossDowned(warden) -> BossDefeated'))).toBe(true);
    expect(disagreements()).toEqual([]);
  });

  it('damage boss to half: the phase sensor moves it to phase 2', () => {
    cheat({ kind: 'damageBoss', amount: Health.max[boss()] / 2 });
    tick();
    expect(BossPhase.phase[boss()]).toBe(2);
  });

  for (const to of ['arena1', 'arena1Cleared', 'arena2', 'arena2Phase2', 'won'] as const) {
    it(`jump to ${to}: the world agrees with the rules`, () => {
      cheat({ kind: 'jump', to });
      expect(disagreements()).toEqual([]);
    });
  }

  it('jump to arena 2, phase 2: down from the perch and already in phase 2', () => {
    cheat({ kind: 'jump', to: 'arena2Phase2' });
    tick();
    expect(RunView.arena).toBe(2);
    expect(BossPhase.phase[boss()]).toBe(2);
    expect(has(boss(), C.Airborne)).toBe(false);
  });
});

describe('every cheat', () => {
  it('marks the run as cheated, is logged with its level, and a restart clears the mark', () => {
    expect(GodMode.cheated).toBe(false);
    cheat({ kind: 'heal' });
    expect(GodMode.cheated).toBe(true);
    expect(readTickLog().at(-1)).toContain('cheat (debug): heal');
    startRun({ seed: 3 });
    expect(GodMode.cheated).toBe(false);
  });

  it('is an input: replaying the same cheats on the same ticks gives the same run', () => {
    const play = (feed: () => void) => {
      startRun({ seed: 3 });
      Object.assign(PlayerInput, { fire: true, aimX: 0, aimZ: -1 });
      for (let i = 0; i < 900; i++) { feed(); tick(); }
      return readTickLog();
    };
    clearDev();
    const live = play(() => {
      if (world.tick === 30) queueDev({ kind: 'god', flag: 'invulnerable', on: true });
      if (world.tick === 200) queueDev({ kind: 'damageBoss', amount: 700 });
      if (world.tick === 400) queueDev({ kind: 'killBoss' });
    });
    const history = devHistory();
    expect(history.map((h) => h.tick)).toEqual([30, 200, 400]);

    clearDev();
    replayDev(history);
    expect(play(() => {})).toEqual(live);
  });
});

describe('time controls', () => {
  it('paused runs no ticks; a step runs exactly one', () => {
    const frame = createFrameDriver(() => {});
    timeControl.paused = true;
    const t = world.tick;
    frame(0.2);
    expect(world.tick).toBe(t);
    timeControl.steps = 1;
    frame(0.2);
    expect(world.tick).toBe(t + 1);
    frame(0.2);
    expect(world.tick).toBe(t + 1);
  });

  it('slow motion runs proportionally fewer ticks', () => {
    const frame = createFrameDriver(() => {});
    timeControl.scale = 0.25;
    const t = world.tick;
    for (let i = 0; i < 10; i++) frame(0.1);
    expect(world.tick - t).toBe(15);
  });

  it('a cheat on a dead handle does nothing', () => {
    const stale = handles.player;
    startRun({ seed: 3 });
    expect(isLive(stale)).toBe(false);
    cheat({ kind: 'set', entity: stale, component: 'Health', field: 'hp', value: 1 });
    expect(Health.hp[player()]).toBe(100);
  });
});
