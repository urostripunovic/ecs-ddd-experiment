import { beforeEach, describe, expect, it } from 'vitest';
import { MatchStatus, MatchView } from '../../ecs/components';
import { send } from '../../ecs/core/outbox';
import { NO_HANDLE } from '../../ecs/core/world';
import { domainStep } from '../dispatch';
import { startMatch, type MatchHandles } from '../spawn';

describe('match flow', () => {
  let h: MatchHandles;
  beforeEach(() => { h = startMatch(); });

  it('the player going down loses the match', () => {
    send('EntityDowned', h.player, h.boss, 0);
    domainStep();
    expect(MatchView.status).toBe(MatchStatus.Lost);
  });

  it('a trade on the same tick keeps the first outcome', () => {
    send('EntityDowned', h.player, h.boss, 0);
    send('EntityDowned', h.boss, NO_HANDLE, 0);
    domainStep();
    expect(MatchView.status).toBe(MatchStatus.Lost);
  });
});
