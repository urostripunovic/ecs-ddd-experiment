import { C, RunStatus, RunView } from '../../ecs/components';
import { helperBuf } from '../../ecs/core/buffers';
import { has, indexOf, isLive, mask, query } from '../../ecs/core/world';
import { bossIdFor } from '../ids';
import { openDoors } from './doors';
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
  const doors = openDoors(run.status === 'Cleared' ? run.doors : null);
  if (RunView.tunnelOpen !== doors.onward) out.push(`onward door open: world ${RunView.tunnelOpen}, rules ${doors.onward}`);
  if (RunView.finalDoorOpen !== doors.final) out.push(`final door open: world ${RunView.finalDoorOpen}, rules ${doors.final}`);
  if (RunView.final !== run.final) out.push(`final arena: world ${RunView.final}, rules ${run.final}`);
  const defeated = store.bosses.get(bossIdFor(run.arena))?.defeated ?? false;
  if (isLive(handles.boss) && has(indexOf(handles.boss), C.Dead) !== defeated) out.push(`boss down: world ${!defeated}, rules ${defeated}`);
  if (RunView.revives !== run.revives) out.push(`revives: world ${RunView.revives}, rules ${run.revives}`);
  const pedestals = query(helperBuf, mask(C.RewardPickup));
  const offered = run.status === 'Cleared' && run.offer ? run.offer.length : 0;
  if (pedestals !== offered) out.push(`reward pedestals: world ${pedestals}, rules ${offered}`);
  const lost = run.status === 'Lost';
  if (isLive(handles.player) && has(indexOf(handles.player), C.Dead) !== lost) out.push(`player down: world ${!lost}, rules ${lost}`);
  return out;
}
