import { world } from '../ecs/core/world';

// Dev-only ring buffer of each tick's chain: command -> event -> component write.
// It answers "where did this come from?" without a debugger.
export const DEV = import.meta.env?.DEV ?? true;

const LOG_SIZE = 256;
const lines: string[] = new Array(LOG_SIZE).fill('');
let head = 0;
let count = 0;

export function logChain(line: string): void {
  if (!DEV) return;
  lines[head] = `tick ${world.tick}: ${line}`;
  head = (head + 1) % LOG_SIZE;
  if (count < LOG_SIZE) count++;
}

// Oldest first. Allocates, so call it from the HUD or a test, not a system.
export function readTickLog(last = LOG_SIZE): string[] {
  const n = Math.min(last, count);
  const start = (head - n + LOG_SIZE) % LOG_SIZE;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(lines[(start + i) % LOG_SIZE]);
  return out;
}

export function clearTickLog(): void {
  head = 0;
  count = 0;
}
