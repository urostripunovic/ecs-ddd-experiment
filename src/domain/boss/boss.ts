import { assertNever, NO_EVENTS, type BossId, type PlayerId, type Tick } from '../shared/types';

// The phase is saved truth; what the boss does inside a phase is the ECS's business.
export type BossPhase = 1 | 2;

export type BossState = {
  readonly id: BossId;
  readonly phase: BossPhase;
  readonly defeated: boolean;
};

export type BossCommand =
  | { kind: 'BossThresholdCrossed'; boss: BossId; share: number; tick: Tick }
  | { kind: 'BossDowned'; boss: BossId; by: PlayerId | null; tick: Tick };

export type BossEvent =
  | { kind: 'BossPhaseReached'; boss: BossId; phase: BossPhase; tick: Tick }
  | { kind: 'BossDefeated'; boss: BossId; by: PlayerId | null; tick: Tick };

export const initialBoss = (id: BossId): BossState => ({ id, phase: 1, defeated: false });

export function decide(cmd: BossCommand, s: BossState): readonly BossEvent[] {
  switch (cmd.kind) {
    case 'BossThresholdCrossed':
      // Idempotent: a duplicate crossing, or one after defeat, changes nothing.
      return s.phase === 1 && !s.defeated
        ? [{ kind: 'BossPhaseReached', boss: s.id, phase: 2, tick: cmd.tick }]
        : NO_EVENTS;
    case 'BossDowned':
      return s.defeated ? NO_EVENTS : [{ kind: 'BossDefeated', boss: s.id, by: cmd.by, tick: cmd.tick }];
    default:
      return assertNever(cmd);
  }
}

export function evolve(s: BossState, e: BossEvent): BossState {
  switch (e.kind) {
    case 'BossPhaseReached': return { ...s, phase: e.phase };
    case 'BossDefeated': return { ...s, defeated: true };
    default: return assertNever(e);
  }
}
