import { describe, expect, it } from 'vitest';
import { Rng, seedStreams, streams, streamsState, restoreStreams } from './rng';

const draws = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe('random streams', () => {
  it('the same seed gives the same numbers', () => {
    expect(draws(new Rng(4), 5)).toEqual(draws(new Rng(4), 5));
    expect(draws(new Rng(4), 5)).not.toEqual(draws(new Rng(5), 5));
  });

  // The reason for streams: one system drawing more (a new mechanic, a tweak)
  // must not change what another system draws for the same seed.
  it('drawing more from one stream never changes another', () => {
    seedStreams(4);
    const dropsAlone = draws(streams.drops, 5);
    seedStreams(4);
    draws(streams.bloom, 50);
    draws(streams.dizzy, 7);
    expect(draws(streams.drops, 5)).toEqual(dropsAlone);
  });

  it('every stream starts somewhere different for the same seed', () => {
    seedStreams(4);
    const firsts = Object.values(streams).map((rng) => rng.next());
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it('can be saved and restored, so a replay or a load continues exactly', () => {
    seedStreams(9);
    draws(streams.stock, 3);
    const saved = streamsState();
    const next = draws(streams.stock, 3);
    restoreStreams(saved);
    expect(draws(streams.stock, 3)).toEqual(next);
  });
});
