import type { MatchEvent } from '../../domain/match/match';
import { assertNever } from '../../domain/shared/types';
import { MatchStatus, MatchView } from '../../ecs/components';

// Writes domain truth into components; never sends commands.
export function projectMatch(e: MatchEvent): string {
  switch (e.kind) {
    case 'MatchWon':
      MatchView.status = MatchStatus.Won;
      MatchView.endedAt = e.tick;
      return 'MatchView=Won';
    case 'MatchLost':
      MatchView.status = MatchStatus.Lost;
      MatchView.endedAt = e.tick;
      return 'MatchView=Lost';
    default:
      return assertNever(e);
  }
}
