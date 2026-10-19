import { decide as decideBoss, evolve as evolveBoss, type BossCommand } from '../domain/boss/boss';
import { decide as decideMatch, evolve as evolveMatch, type MatchCommand } from '../domain/match/match';
import { assertNever } from '../domain/shared/types';
import { clearOutbox, outbox } from '../ecs/core/outbox';
import { projectBoss } from './boss/projector';
import { toCommand, type Command } from './commands';
import { matchCommandFromBoss } from './match/commands';
import { projectMatch } from './match/projector';
import { store } from './store';
import { logChain } from './tick-log';

// Cascades (boss defeated -> match won) run in the same step but never re-enter
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
    case 'BossThresholdCrossed':
    case 'BossDowned':
      return handleBoss(cmd);
    case 'PlayerDowned':
    case 'BossCleared':
      return handleMatch(cmd);
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
    const next = matchCommandFromBoss(ev);
    if (next) cascade.push(next);
  }
  store.bosses.set(cmd.boss, s);
}

function handleMatch(cmd: MatchCommand): void {
  const events = decideMatch(cmd, store.match);
  for (const ev of events) {
    store.match = evolveMatch(store.match, ev);
    logChain(`${cmd.kind} -> ${ev.kind} -> ${projectMatch(ev)}`);
  }
}
