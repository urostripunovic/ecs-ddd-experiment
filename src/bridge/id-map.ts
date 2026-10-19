import type { BossId, PlayerId, WeaponId } from '../domain/shared/types';
import type { Handle } from '../ecs/core/world';

// Domain IDs are stable and saved; entity handles are recycled. This is the
// only place the two meet.
export type DomainRef =
  | { readonly context: 'boss'; readonly id: BossId }
  | { readonly context: 'player'; readonly id: PlayerId }
  | { readonly context: 'weapon'; readonly id: WeaponId };

const byHandle = new Map<Handle, DomainRef>();
const bossHandles = new Map<BossId, Handle>();
const playerHandles = new Map<PlayerId, Handle>();
let weaponCount = 0;

export const idMap = {
  bind(h: Handle, ref: DomainRef): void {
    byHandle.set(h, ref);
    if (ref.context === 'boss') bossHandles.set(ref.id, h);
    if (ref.context === 'player') playerHandles.set(ref.id, h);
  },
  refOf: (h: Handle): DomainRef | undefined => byHandle.get(h),
  handleOfBoss: (id: BossId): Handle | undefined => bossHandles.get(id),
  handleOfPlayer: (id: PlayerId): Handle | undefined => playerHandles.get(id),
  // Weapons are born in the simulation; one only gets a domain ID the first
  // time it crosses into the rules (carried to the next arena), and keeps it after.
  weaponIdOf(h: Handle): WeaponId {
    const ref = byHandle.get(h);
    if (ref?.context === 'weapon') return ref.id;
    const id = `w-${++weaponCount}` as WeaponId;
    idMap.bind(h, { context: 'weapon', id });
    return id;
  },
  // Between arenas: every handle is stale, but minted IDs stay unique for the run.
  unbindHandles(): void {
    byHandle.clear();
    bossHandles.clear();
    playerHandles.clear();
  },
  clear(): void {
    idMap.unbindHandles();
    weaponCount = 0;
  },
};
