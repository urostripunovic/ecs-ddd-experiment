import type { BossCommand } from '../domain/boss/boss';
import type { MatchCommand } from '../domain/match/match';
import type { OutboxSlot } from '../ecs/core/outbox';
import { toBossCommand } from './boss/commands';
import { toMatchCommand } from './match/commands';

// Every command the domain accepts, composed from each context's own union.
export type Command = BossCommand | MatchCommand;

// A slot's subject belongs to exactly one context, so the first match wins.
export const toCommand = (slot: OutboxSlot): Command | null =>
  toBossCommand(slot) ?? toMatchCommand(slot);
