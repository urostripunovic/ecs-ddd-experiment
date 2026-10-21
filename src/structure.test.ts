// Structure checks: what a reviewer would catch by eye, made into tests so it
// can't slip by under deadline. Added after Stage C, when weapons.ts,
// boss-scripts.ts and scene.ts had grown past 700 lines unremarked, weapons
// had picked up "is this the hammer?" branches, and a few fields had quietly
// gained second writers (see SKILL-NOTES.md).
import { describe, expect, it } from 'vitest';
import * as components from './ecs/components';
import { RunViewWritable } from './ecs/components/run-view';

const sources = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });
const code = Object.entries(sources).filter(([file]) => !file.endsWith('.test.ts'));

// A file past this has usually stopped having one job. Split it before adding to it.
const MAX_LINES = 400;

describe('structure', () => {
  it(`keeps every source file under ${MAX_LINES} lines`, () => {
    const long = code.filter(([, text]) => text.split('\n').length > MAX_LINES).map(([file, text]) => `${file} (${text.split('\n').length})`);
    expect(long).toEqual([]);
  });

  // How a weapon behaves is its definition's business (WeaponDef fields); a
  // system asking "is this the hammer?" grows a branch per weapon.
  it('never branches on a weapon kind outside the weapon definitions', () => {
    const branching = code
      .filter(([file]) => !file.includes('/weapons/defs.ts'))
      .filter(([, text]) => /[!=]==\s*WeaponKind\.|WeaponKind\.\w+\s*[!=]==/.test(text))
      .map(([file]) => file);
    expect(branching).toEqual([]);
  });

  // One writer per field (rules-and-simulation). Building an entity (prefabs,
  // the spawn projection) and cheats don't count: they write before or around
  // the systems, never alongside them. Every field more than one module still
  // writes is here with its reason, so a new one is a decision, not an accident.
  const SHARED_ON_PURPOSE: Record<string, string> = {
    'Transform.x': 'one mover per kind of entity: players move, bosses are scripted, items follow or fly, pillars orbit; collision corrects all',
    'Transform.z': 'as Transform.x',
    'Transform.px': 'the render snapshot, and an item thrown from the hand starts its interpolation there',
    'Transform.pz': 'as Transform.px',
    'Velocity.x': 'one driver per kind of entity: input for players, scripts for bosses, the weapon systems for items, homing for orbs; death zeroes it',
    'Velocity.z': 'as Velocity.x',
    'Health.hp': 'hurt() is the only way down; a revive and the heal reward set it back up',
    'Hurt.flash': 'hurt() sets it, hurtFlashSystem counts it down',
    'Slam.timer': 'a script starts the telegraph, slamSystem counts it down',
    'Shake.trauma': 'every writer only raises it and shakeSystem decays it, so the strongest shake wins',
    'Knockback.x': 'every shove (the roar, spikes, a charge, a revive clearing space) sets a fresh one; the latest wins',
    'Knockback.z': 'as Knockback.x',
    'Knockback.until': 'as Knockback.x',
    'RunViewWritable.status': 'the run projector, and the spawn projection rebuilding it on a load',
    'Ammo.count': 'a magazine is spent by firing (attacks) and all at once by the Final shot (throwing)',
    'Ammo.reload': 'as Ammo.count: both start the reload they cause',
    'Thrown.dmg': 'set at the release (throwing), then grown by each Ricochet bounce in flight',
    'Thrown.bounces': 'set at the release, spent by each bounce in flight',
    'Thrown.ticksLeft': 'set at the release, counted down in flight, renewed when a chakram turns home',
    'Thrown.leg': 'set at the release, turned by the chakram in flight',
    'Thrown.lastHit': 'cleared at the release, kept by the chakram in flight',
    'Buffs.hasteUntil': 'a haste pickup and a caught chakram; each only pushes the deadline later',
  };

  it('every field written by more than one module is listed, with its reason', () => {
    const names = new Map<unknown, string>(Object.entries(components).map(([name, value]) => [value, name]));
    names.set(RunViewWritable, 'RunViewWritable');
    const known = new Set(names.values());
    const building = (file: string) => file.endsWith('/prefabs.ts') || file.endsWith('/bridge/spawn.ts') || file.includes('/app/dev/');
    const writers = new Map<string, Set<string>>();
    const write = /\b([A-Z]\w+)\.(\w+)(?:\[[^\]]*\])?\s*(?:=(?!=)|\+=|-=|\*=|\+\+|--)/g;
    for (const [file, text] of code) {
      if (building(file)) continue;
      for (const line of text.split('\n')) {
        if (line.trim().startsWith('//')) continue;
        for (const [, component, field] of line.matchAll(write)) {
          if (!known.has(component)) continue;
          const key = `${component}.${field}`;
          if (!writers.has(key)) writers.set(key, new Set());
          writers.get(key)!.add(file);
        }
      }
    }
    const shared = [...writers].filter(([, files]) => files.size > 1).map(([key, files]) => `${key}: ${[...files].join(', ')}`);
    const unlisted = shared.filter((line) => !(line.split(':')[0] in SHARED_ON_PURPOSE));
    expect(unlisted).toEqual([]);
  });
});
