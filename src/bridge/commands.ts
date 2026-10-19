import type { BossCommand } from '../domain/boss/boss';
import type { RunCommand } from '../domain/run/run';
import type { OutboxSlot } from '../ecs/core/outbox';
import { toBossCommand } from './boss/commands';
import { toRunCommand } from './run/commands';

// Every command the domain accepts, composed from each area's own union.
export type Command = BossCommand | RunCommand;

// A slot's subject belongs to exactly one area, so the first match wins.
export const toCommand = (slot: OutboxSlot): Command | null =>
  toBossCommand(slot) ?? toRunCommand(slot);
