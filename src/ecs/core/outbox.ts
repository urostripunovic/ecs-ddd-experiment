import { world, type Handle } from './world';

// Commands to the domain, in reused slots (no allocation). The ECS only names
// what the simulation saw; the bridge decides which bounded context it means.
//
// Lives in ecs/ rather than bridge/ so that ecs/ never imports bridge/:
// systems write here, the bridge drains it.
export type OutboxKind = 'EntityDowned' | 'BossThresholdCrossed';
export type OutboxSlot = { kind: OutboxKind; subject: Handle; other: Handle; value: number; tick: number };

export const OUTBOX_SIZE = 64;

export const outbox = {
  slots: Array.from({ length: OUTBOX_SIZE }, (): OutboxSlot => ({
    kind: 'EntityDowned', subject: 0 as Handle, other: 0 as Handle, value: 0, tick: 0,
  })),
  count: 0,
};

export function send(kind: OutboxKind, subject: Handle, other: Handle, value: number): void {
  if (outbox.count === OUTBOX_SIZE) throw new Error('outbox full: raise OUTBOX_SIZE');
  const slot = outbox.slots[outbox.count++];
  slot.kind = kind;
  slot.subject = subject;
  slot.other = other;
  slot.value = value;
  slot.tick = world.tick;
}

export function clearOutbox(): void {
  outbox.count = 0;
}
