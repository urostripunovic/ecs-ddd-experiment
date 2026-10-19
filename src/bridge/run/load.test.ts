import { describe, expect, it } from 'vitest';
import type { BossState } from '../../domain/boss/boss';
import type { RunState } from '../../domain/run/run';
import type { BossId } from '../../domain/shared/types';
import { Arena, C, RunStatus, RunView, Transform } from '../../ecs/components';
import { send } from '../../ecs/core/outbox';
import { has, indexOf } from '../../ecs/core/world';
import { deathSystem } from '../../ecs/systems/combat';
import { tunnelSystem } from '../../ecs/systems/tunnel';
import { domainStep } from '../dispatch';
import { bossIdFor } from '../ids';
import { buildArena, handles, startRun } from '../spawn';
import { store } from '../store';
import { readTickLog } from '../tick-log';

// Loading is building a level from saved rules state. Every state the rules can
// be in must build a world that agrees with them, not only the states play reaches.
type Saved = { run: RunState; bosses: [BossId, BossState][] };

const save = (): Saved => structuredClone({ run: store.run, bosses: [...store.bosses] });

function load(saved: Saved): void {
  startRun();
  store.run = structuredClone(saved.run);
  store.bosses = new Map(structuredClone(saved.bosses));
  buildArena(store.run.arena, store.run.loadout);
}

const VIEW = { Fighting: RunStatus.Fighting, Cleared: RunStatus.Cleared, Won: RunStatus.Won, Lost: RunStatus.Lost };

function expectWorldAgrees(saved: Saved): void {
  const { run } = saved;
  const boss = new Map(saved.bosses).get(bossIdFor(run.arena));
  expect(RunView).toMatchObject({ arena: run.arena, status: VIEW[run.status], tunnelOpen: run.status === 'Cleared' });
  expect(has(indexOf(handles.boss), C.Dead)).toBe(boss?.defeated ?? false);
  expect(has(indexOf(handles.player), C.Dead)).toBe(run.status === 'Lost');

  // Nothing in the rebuilt world disagrees enough to ask the rules anything.
  const log = readTickLog().length;
  deathSystem();
  domainStep();
  expect(readTickLog()).toHaveLength(log);
  expect(store.run).toEqual(run);
}

const downBoss = () => { send('EntityDowned', handles.boss, handles.player, 0); domainStep(); };
const intoTunnel = () => {
  Transform.x[indexOf(handles.player)] = 0;
  Transform.z[indexOf(handles.player)] = -(Arena.half + 4);
  tunnelSystem();
  domainStep();
};

// One per state in docs/ARCHITECTURE.md's rules examples.
const STATES: [string, () => void][] = [
  ['fighting in arena 1 (R1)', () => {}],
  ['arena 1 cleared (R2)', downBoss],
  ['fighting in arena 2 (R3)', () => { downBoss(); intoTunnel(); }],
  ['won (R5)', () => { downBoss(); intoTunnel(); downBoss(); }],
  ['lost (R6)', () => { send('EntityDowned', handles.player, handles.boss, 0); domainStep(); }],
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
