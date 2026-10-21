import { decide as decideBoss, evolve as evolveBoss, type BossCommand } from '../domain/boss/boss';
import { decide as decideRun, evolve as evolveRun, type RunCommand } from '../domain/run/run';
import { assertNever } from '../domain/shared/types';
import { clearOutbox, outbox } from '../ecs/core/outbox';
import { projectBoss } from './boss/projector';
import { toCommand, type Command } from './commands';
import { runCommandFromBoss } from './run/commands';
import { projectRun, takePendingArena } from './run/projector';
import { buildArena } from './spawn';
import { store } from './store';
import { logChain } from './tick-log';

// Cascades (boss defeated -> arena cleared) run in the same step but never re-enter
// the outbox being drained; the bound turns an accidental cycle into an error.
const MAX_CASCADE_DEPTH = 4;
const cascade: Command[] = [];

// The domain step: runs once per tick, synchronously, after the simulation
// and before rendering, so a decision is applied before anything is drawn.
export function domainStep(): void {
  for (let i = 0; i < outbox.count; i++) {
    const cmd = toCommand(outbox.slots[i]);
    if (cmd) run(cmd);
  }
  clearOutbox();
  // Last, because it replaces every entity the step above might still have touched.
  const next = takePendingArena();
  if (next) {
    buildArena(next.arena, next.loadout);
    logChain(`arena ${next.arena} built from the run's state`);
  }
}

function run(first: Command): void {
  let depth = 0;
  cascade.length = 0;
  cascade.push(first);
  while (cascade.length > 0) {
    if (depth++ > MAX_CASCADE_DEPTH) throw new Error(`cascade deeper than ${MAX_CASCADE_DEPTH}: ${first.kind}`);
    const batch = cascade.splice(0);
    for (const cmd of batch) handle(cmd);
  }
}

function handle(cmd: Command): void {
  switch (cmd.kind) {
    case 'BossDowned':
      return handleBoss(cmd);
    case 'PlayerDowned':
    case 'BossCleared':
    case 'TunnelEntered':
    case 'RewardChosen':
      return handleRun(cmd);
    default:
      return assertNever(cmd);
  }
}

function handleBoss(cmd: BossCommand): void {
  let s = store.bosses.get(cmd.boss);
  if (!s) return;
  for (const ev of decideBoss(cmd, s)) {
    s = evolveBoss(s, ev);
    logChain(`${cmd.kind}(${cmd.boss}) -> ${ev.kind} -> ${projectBoss(ev)}`);
    const next = runCommandFromBoss(ev);
    if (next) cascade.push(next);
  }
  store.bosses.set(cmd.boss, s);
}

function handleRun(cmd: RunCommand): void {
  const events = decideRun(cmd, store.run);
  for (const ev of events) {
    store.run = evolveRun(store.run, ev);
    logChain(`${cmd.kind} -> ${ev.kind} -> ${projectRun(ev)}`);
  }
}
