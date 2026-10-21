import type { BossCommand } from '../../domain/boss/boss';
import { assertNever, type Tick } from '../../domain/shared/types';
import type { OutboxSlot } from '../../ecs/core/outbox';
import { idMap } from '../id-map';

// Translates what the simulation saw into a boss command; null when the slot
// is not about a boss.
export function toBossCommand(slot: OutboxSlot): BossCommand | null {
  const ref = idMap.refOf(slot.subject);
  if (ref?.context !== 'boss') return null;
  const tick = slot.tick as Tick;
  switch (slot.kind) {
    case 'EntityDowned': {
      const by = idMap.refOf(slot.other);
      return { kind: 'BossDowned', boss: ref.id, by: by?.context === 'player' ? by.id : null, tick };
    }
    case 'TunnelEntered':
    case 'RewardTouched':
      return null;
    default:
      return assertNever(slot.kind);
  }
}
