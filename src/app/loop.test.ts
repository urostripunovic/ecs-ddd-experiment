import { describe, expect, it } from 'vitest';
import { idMap } from '../bridge/id-map';
import { BOSS_ID, startRun } from '../bridge/spawn';
import { readTickLog } from '../bridge/tick-log';
import { BossPhase, RunStatus, RunView, PlayerInput } from '../ecs/components';
import { indexOf, world } from '../ecs/core/world';
import { createFrameDriver, tick } from './loop';

// The whole stack headless: player holds fire at the boss straight ahead.
function fight(bossHp: number, maxTicks = 1800): string[] {
  startRun({ bossHp });
  PlayerInput.aimX = 0;
  PlayerInput.aimZ = -1;
  PlayerInput.fire = true;
  while (RunView.status === RunStatus.Fighting && world.tick < maxTicks) tick();
  return readTickLog();
}

describe('arena loop', () => {
  it('shooting the boss reaches phase 2 and then clears arena 1', () => {
    const log = fight(300);
    const boss = indexOf(idMap.handleOfBoss(BOSS_ID)!);
    const kinds = log.map((l) => l.split(': ')[1]);

    // The phase is simulation, so it never appears in the rules' log.
    expect(kinds).toEqual([
      'BossDowned(warden) -> BossDefeated -> no component change',
      'BossCleared -> ArenaCleared -> RunView=Cleared, tunnel open',
      // The same clear offers three rewards, drawn from the run's seed (R12).
      expect.stringMatching(/^BossCleared -> RewardsOffered -> pedestals for \w+ and \w+ and \w+$/),
    ]);
    expect(BossPhase.phase[boss]).toBe(2);
  });

  it('is deterministic: the same inputs give the same tick log', () => {
    expect(fight(600)).toEqual(fight(600));
  });

  it('uneven frame times give the same result as a steady 60 Hz', () => {
    const steady = fight(300);

    startRun({ bossHp: 300 });
    Object.assign(PlayerInput, { aimX: 0, aimZ: -1, fire: true });
    const frame = createFrameDriver(() => {});
    const pattern = [1 / 144, 1 / 144, 1 / 30, 1 / 144, 0.12, 1 / 30];
    for (let i = 0; RunView.status === RunStatus.Fighting && world.tick < 1800; i++) {
      frame(pattern[i % pattern.length]);
    }
    // A frame may run a few ticks past the deciding one, but the log stops there.
    expect(readTickLog()).toEqual(steady);
  });
});

// A system the tick never calls passes every unit test (each builds its own
// step list) and silently does nothing in the game: burnSystem once did. So
// every exported system must be in the tick, and in the architecture doc's order.
describe('the tick order', () => {
  // Read through Vite's raw imports, like the docs test, so no Node types are needed.
  const sources = import.meta.glob<string>('../ecs/systems/*.ts', { query: '?raw', import: 'default', eager: true });
  const exported = Object.entries(sources)
    .filter(([file]) => !file.endsWith('.test.ts'))
    .flatMap(([, text]) => [...text.matchAll(/export function (\w+System)\(/g)].map((m) => m[1]));
  const loop = Object.values(import.meta.glob<string>('./loop.ts', { query: '?raw', import: 'default', eager: true }))[0];
  const tickBody = loop.slice(loop.indexOf('export function tick('));
  const doc = Object.values(import.meta.glob<string>('../../docs/ARCHITECTURE.md', { query: '?raw', import: 'default', eager: true }))[0];

  it('calls every system', () => {
    expect(exported.length).toBeGreaterThan(20);
    for (const system of exported) expect(tickBody, `${system} is never called by tick()`).toMatch(new RegExp(`\\b${system}\\(`));
  });

  it('is written down in the architecture doc', () => {
    for (const system of exported) expect(doc, `${system} is missing from the tick order`).toContain(`\`${system}\``);
  });
});
