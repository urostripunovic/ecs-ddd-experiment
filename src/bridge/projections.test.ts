import { describe, expect, it } from 'vitest';
import { RunStatus, RunView } from '../ecs/components';
import { RunViewWritable } from '../ecs/components/run-view';

// RunView is the rules' decision shown to the world. Everyone may read it; only
// the bridge may write it, through RunViewWritable, which the zone lint lets
// only bridge/ (and tests) import. A system that wants the run to change sends
// a request instead.
describe('projection ownership', () => {
  it('RunView is read-only to everyone else, and the same object the bridge writes', () => {
    // @ts-expect-error read-only outside the bridge: this line must not compile
    RunView.tunnelOpen = true;
    RunViewWritable.status = RunStatus.Cleared;
    expect(RunView.status).toBe(RunStatus.Cleared);
    RunViewWritable.status = RunStatus.Fighting;
    RunViewWritable.tunnelOpen = false;
  });
});
