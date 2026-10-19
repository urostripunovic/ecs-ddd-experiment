import { C, RunStatus, RunView } from '../../ecs/components';
import { has, indexOf, isLive } from '../../ecs/core/world';
import { bossIdFor } from '../ids';
import { handles } from '../spawn';
import { store } from '../store';

const VIEW = { Fighting: RunStatus.Fighting, Cleared: RunStatus.Cleared, Won: RunStatus.Won, Lost: RunStatus.Lost };

// Does the world agree with the rules? Empty means yes. The load test asserts
// it for every examples-table state; the dev menu checks it after every jump.
export function disagreements(): string[] {
  const run = store.run;
  const out: string[] = [];
  if (RunView.arena !== run.arena) out.push(`arena: world ${RunView.arena}, rules ${run.arena}`);
  if (RunView.status !== VIEW[run.status]) out.push(`status: world ${RunView.status}, rules ${run.status}`);
  if (RunView.tunnelOpen !== (run.status === 'Cleared')) out.push(`tunnel open: ${RunView.tunnelOpen} while ${run.status}`);
  const defeated = store.bosses.get(bossIdFor(run.arena))?.defeated ?? false;
  if (isLive(handles.boss) && has(indexOf(handles.boss), C.Dead) !== defeated) out.push(`boss down: world ${!defeated}, rules ${defeated}`);
  const lost = run.status === 'Lost';
  if (isLive(handles.player) && has(indexOf(handles.player), C.Dead) !== lost) out.push(`player down: world ${!lost}, rules ${lost}`);
  return out;
}
