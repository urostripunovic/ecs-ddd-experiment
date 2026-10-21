import { describe, expect, it } from 'vitest';
import { build } from 'vite';

// Cheats must never ship. Build the release bundle in memory and look for the
// god menu and the cheat commands in it.
describe('release build', () => {
  it('contains no god menu and no cheat commands', async () => {
    // Vitest runs with NODE_ENV=test, which Vite would treat as a dev build.
    const { env } = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process;
    const before = env.NODE_ENV;
    env.NODE_ENV = 'production';
    const result = await build({ logLevel: 'silent', mode: 'production', build: { write: false } }).finally(() => {
      env.NODE_ENV = before;
    });
    const outputs = (Array.isArray(result) ? result : [result]) as { output: { type: string; code?: string; fileName: string }[] }[];
    const chunks = outputs.flatMap((r) => r.output).filter((o) => o.type === 'chunk');
    expect(chunks.length).toBeGreaterThan(0);
    const code = chunks.map((c) => c.code ?? '').join('\n');
    for (const marker of ['God mode', 'god mode', 'killBoss', 'applyDevCommands', 'GodMode.keepWeapons', 'freezeBoss&&', 'Clear the note first']) {
      expect(code.includes(marker), marker).toBe(false);
    }
    // The game itself is in there.
    expect(code.includes('ARENA CLEARED')).toBe(true);
  }, 60_000);
});
