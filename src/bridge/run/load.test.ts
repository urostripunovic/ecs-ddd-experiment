import { describe, expect, it } from 'vitest';
import type { BossState } from '../../domain/boss/boss';
import type { RunState } from '../../domain/run/run';
import type { BossId } from '../../domain/shared/types';
import { MIN_DRAWN, type Door } from '../../domain/run/run';
import { DOORS } from '../../ecs/arenas';
import { Arena, Armor, C, Transform } from '../../ecs/components';
import { Perk, setPerks } from '../../ecs/systems/perks';
import { buf } from '../../ecs/core/buffers';
import { rewardSensorSystem } from '../../ecs/systems/rewards';
import { send } from '../../ecs/core/outbox';
import { indexOf, query, type EntityId } from '../../ecs/core/world';
import { deathSystem } from '../../ecs/systems/combat';
import { tunnelSystem } from '../../ecs/systems/tunnel';
import { domainStep } from '../dispatch';
import { handles, loadRunState, startRun } from '../spawn';
import { disagreements } from './agree';
import { store } from '../store';
import { readTickLog } from '../tick-log';

// Loading is building a level from saved rules state. Every state the rules can
// be in must build a world that agrees with them, not only the states play reaches.
type Saved = { run: RunState; bosses: [BossId, BossState][] };

const save = (): Saved => structuredClone({ run: store.run, bosses: [...store.bosses] });

function load(saved: Saved): void {
  startRun();
  loadRunState(structuredClone(saved.run), new Map(structuredClone(saved.bosses)));
}

function expectWorldAgrees(saved: Saved): void {
  const { run } = saved;
  expect(disagreements()).toEqual([]);

  // Nothing in the rebuilt world disagrees enough to ask the rules anything.
  const log = readTickLog().length;
  deathSystem();
  domainStep();
  expect(readTickLog()).toHaveLength(log);
  expect(store.run).toEqual(run);
}

const downBoss = () => { send('EntityDowned', handles.boss, handles.player, 0); domainStep(); };
const downPlayer = () => { send('EntityDowned', handles.player, handles.boss, 0); domainStep(); };
const takeReward = () => {
  const p = indexOf(handles.player);
  const first = buf[query(buf, C.RewardPickup) - 1] as EntityId;
  Transform.x[p] = Transform.x[first];
  Transform.z[p] = Transform.z[first];
  rewardSensorSystem();
  domainStep();
};
const intoTunnel = (door: Door = 'onward') => {
  Transform.x[indexOf(handles.player)] = DOORS[door].x;
  Transform.z[indexOf(handles.player)] = -(Arena.half + 4);
  tunnelSystem();
  domainStep();
};

// Strong enough for the fork: three perks and three plates on top of the start.
const strong = () => {
  const p = indexOf(handles.player);
  setPerks(p, [Perk.LastStand, Perk.Adrenaline, Perk.Ricochet]);
  Armor.gained[p] = 3;
  Armor.broken[p] = 0;
};

// One per state in docs/ARCHITECTURE.md's rules examples.
const STATES: [string, () => void][] = [
  ['fighting in arena 1 (R1)', () => {}],
  ['arena 1 cleared, three rewards on offer (R2, R12)', downBoss],
  ['arena 1 cleared, a reward taken (R13)', () => { downBoss(); takeReward(); }],
  ['revived once (R11)', downPlayer],
  ['fighting in arena 2 (R3)', () => { downBoss(); intoTunnel(); }],
  ['cleared with the final door open beside the onward one (R17)', () => {
    for (let i = 0; i <= MIN_DRAWN; i++) { if (i > 0) intoTunnel(); strong(); downBoss(); }
  }],
  ['fighting the final (R17)', () => {
    for (let i = 0; i <= MIN_DRAWN; i++) { if (i > 0) intoTunnel(); strong(); downBoss(); }
    intoTunnel('final');
  }],
  ['won (R5)', () => {
    while (!store.run.final) { downBoss(); intoTunnel(store.run.doors === 'final' ? 'final' : 'onward'); }
    downBoss();
  }],
  ['lost, every revive spent (R6)', () => { for (let i = 0; i < 4; i++) downPlayer(); }],
];

describe('loading a saved run', () => {
  for (const [name, reach] of STATES) {
    it(`builds a world that agrees with the rules: ${name}`, () => {
      startRun();
      reach();
      const saved = save();
      load(saved);
      expectWorldAgrees(saved);
    });
  }
});
