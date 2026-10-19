import { assertNever, NO_EVENTS, type BossId, type PlayerId, type Tick } from '../shared/types';

// The boss's lifecycle: alive, then defeated, once. The run reacts to the defeat.
// Its phases and attacks are the simulation's: nothing outside the fight reacts
// to them. If something ever does (a checkpoint mid-fight, a story beat), the
// phase comes back here.
export type BossState = {
  readonly id: BossId;
  readonly defeated: boolean;
};

export type BossCommand = { kind: 'BossDowned'; boss: BossId; by: PlayerId | null; tick: Tick };

export type BossEvent = { kind: 'BossDefeated'; boss: BossId; by: PlayerId | null; tick: Tick };

export const initialBoss = (id: BossId): BossState => ({ id, defeated: false });

export function decide(cmd: BossCommand, s: BossState): readonly BossEvent[] {
  switch (cmd.kind) {
    case 'BossDowned':
      return s.defeated ? NO_EVENTS : [{ kind: 'BossDefeated', boss: s.id, by: cmd.by, tick: cmd.tick }];
    default:
      return assertNever(cmd.kind);
  }
}

export function evolve(s: BossState, e: BossEvent): BossState {
  switch (e.kind) {
    case 'BossDefeated': return { ...s, defeated: true };
    default: return assertNever(e.kind);
  }
}
