import { describe, expect, it } from 'vitest';

// RunView is the rules' decision shown to the world: only the bridge writes it
// (the run projector, and buildArena when it builds from rules state). The ECS
// owns the component, so the zone lint can't see a system writing it; this can.
// A system that wants the run to change sends a request instead.
const sources = import.meta.glob<string>('../**/*.ts', { query: '?raw', import: 'default', eager: true });
const outsideBridge = Object.entries(sources).filter(
  ([path]) => !path.endsWith('.test.ts') && !path.startsWith('./') && !path.startsWith('../bridge/'),
);
const WRITES_RUN_VIEW = /\bRunView\.\w+\s*(?:[+\-*/]?=(?!=)|\+\+|--)|Object\.assign\(\s*RunView\b/;

describe('projection ownership', () => {
  it('only the bridge writes RunView', () => {
    const writers = outsideBridge.filter(([, src]) => WRITES_RUN_VIEW.test(src)).map(([path]) => path);
    expect(writers).toEqual([]);
  });
});
