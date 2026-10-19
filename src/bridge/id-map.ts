import type { BossId, PlayerId } from '../domain/shared/types';
import type { Handle } from '../ecs/core/world';

// Domain IDs are stable and saved; entity handles are recycled. This is the
// only place the two meet.
export type DomainRef =
  | { readonly context: 'boss'; readonly id: BossId }
  | { readonly context: 'player'; readonly id: PlayerId };

const byHandle = new Map<Handle, DomainRef>();
const bossHandles = new Map<BossId, Handle>();

export const idMap = {
  bind(h: Handle, ref: DomainRef): void {
    byHandle.set(h, ref);
    if (ref.context === 'boss') bossHandles.set(ref.id, h);
  },
  refOf: (h: Handle): DomainRef | undefined => byHandle.get(h),
  handleOfBoss: (id: BossId): Handle | undefined => bossHandles.get(id),
  clear(): void {
    byHandle.clear();
    bossHandles.clear();
  },
};
