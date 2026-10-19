import { assertNever, NO_EVENTS, type BossId, type PlayerId, type Tick } from '../shared/types';

// Win and loss change the game's mode and would be saved, so they are rules,
// not something the simulation decides by itself.
export type MatchStatus = 'Fighting' | 'Won' | 'Lost';

export type MatchState = {
  readonly status: MatchStatus;
  readonly endedAt: Tick | null;
};

export type MatchCommand =
  | { kind: 'PlayerDowned'; player: PlayerId; tick: Tick }
  | { kind: 'BossCleared'; boss: BossId; tick: Tick };

export type MatchEvent =
  | { kind: 'MatchLost'; player: PlayerId; tick: Tick }
  | { kind: 'MatchWon'; boss: BossId; tick: Tick };

export const initialMatch = (): MatchState => ({ status: 'Fighting', endedAt: null });

export function decide(cmd: MatchCommand, s: MatchState): readonly MatchEvent[] {
  // First outcome wins: a trade on the same tick never flips a finished match.
  if (s.status !== 'Fighting') return NO_EVENTS;
  switch (cmd.kind) {
    case 'PlayerDowned': return [{ kind: 'MatchLost', player: cmd.player, tick: cmd.tick }];
    case 'BossCleared': return [{ kind: 'MatchWon', boss: cmd.boss, tick: cmd.tick }];
    default: return assertNever(cmd);
  }
}

export function evolve(s: MatchState, e: MatchEvent): MatchState {
  switch (e.kind) {
    case 'MatchLost': return { ...s, status: 'Lost', endedAt: e.tick };
    case 'MatchWon': return { ...s, status: 'Won', endedAt: e.tick };
    default: return assertNever(e);
  }
}
