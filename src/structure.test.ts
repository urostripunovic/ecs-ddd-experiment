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

const mutations = Object.values(import.meta.glob<{ default: { name: string; file: string; find: string; tests: string[] }[] }>(
  '../tools/mutations/mutations.json', { eager: true },
))[0].default;
const anyFile = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });

// A simulation module has one job. These say when to stop and check it still
// does: it writes many kinds of component, or it's long. Neither fails a
// module for being what it is; a module past either has to state its one job
// here, in a sentence. Can't write one honestly? Split it.
// Position and velocity are left out of the count: nearly everything moves.
const MAX_WRITTEN = 4;
const MAX_LINES = 500;
const ONE_JOB: Record<string, string> = {
  './ecs/systems/boss-scripts/moves.ts': 'the library of boss moves; each move starts its own effect, and the scripts compose them',
  './ecs/systems/pillars.ts': 'the pillars: how they move, and what they do to whatever they meet',
  './ecs/systems/weapons/throwing.ts': 'letting go of throw: a throw, a spin wound up and released, or the Final shot',
};

describe('structure', () => {
  it(`a simulation module writing more than ${MAX_WRITTEN} kinds of component, or longer than ${MAX_LINES} lines, states its one job`, () => {
    const names = new Set(Object.keys(components));
    const write = /\b([A-Z]\w+)\.\w+(?:\[[^\]]*\])?\s*(?:=(?!=)|\+=|-=|\*=|\+\+|--)/g;
    const flagged = code
      .filter(([file]) => file.startsWith('./ecs/systems/'))
      .flatMap(([file, text]) => {
        const kinds = new Set<string>();
        for (const line of text.split('\n')) {
          if (line.trim().startsWith('//')) continue;
          for (const [, component] of line.matchAll(write)) {
            if (names.has(component) && component !== 'Transform' && component !== 'Velocity') kinds.add(component);
          }
        }
        const lines = text.split('\n').length;
        return kinds.size > MAX_WRITTEN || lines > MAX_LINES ? [`${file}: writes ${[...kinds].sort().join(', ')}; ${lines} lines`] : [];
      });
    const unstated = flagged.filter((line) => !(line.split(':')[0] in ONE_JOB));
    const noLongerNeeded = Object.keys(ONE_JOB).filter((file) => !flagged.some((line) => line.startsWith(`${file}:`)));
    expect(unstated).toEqual([]);
    expect(noLongerNeeded).toEqual([]);
  });

  // A mutation whose text is gone (the code moved, or changed shape) is skipped,
  // and a mutation whose tests moved is "missed": both happened after a split,
  // unnoticed, because the mutation run is too slow for every check. This part is fast.
  it('every mutation still finds its text once, and its tests exist', () => {
    const stale = mutations.flatMap((m) => {
      const source = anyFile[`./${m.file.replace(/^src\//, '')}`];
      const problems: string[] = [];
      if (source === undefined) problems.push(`${m.name}: no file ${m.file}`);
      else if (source.split(m.find).length !== 2) problems.push(`${m.name}: its text is not in ${m.file} exactly once`);
      for (const test of m.tests) if (anyFile[`./${test.replace(/^src\//, '')}`] === undefined) problems.push(`${m.name}: no test file ${test}`);
      return problems;
    });
    expect(mutations.length).toBeGreaterThan(50);
    expect(stale).toEqual([]);
  });

  // Randomness is injected: a system takes the stream it draws from as a
  // parameter, and only the tick order (the composition root) and the run's
  // start pick which stream that is. A system reaching for a shared source
  // would make its draws shift every other system's for the same seed.
  it('no system draws from a random source it wasn\'t given', () => {
    const reaching = code
      .filter(([file]) => file.includes('/ecs/systems/'))
      .filter(([, text]) => /import \{[^}]*\b(random|randomRange|streams)\b[^}]*\} from '[./]+\/core\/rng'/.test(text))
      .map(([file]) => file);
    expect(reaching).toEqual([]);
  });

  // A test that steps its own list of systems tests a different game: it can
  // leave out a system the real tick runs, or run them in another order, and
  // still pass (a burn system once passed every test and never ran in play).
  // Tests step with stepper() from the shared tick order instead. Three or more
  // system calls in a row is a hand-built step list.
  it('no test builds its own list of systems to step', () => {
    const tests = Object.entries(sources).filter(([file]) => file.endsWith('.test.ts'));
    const handBuilt = tests.flatMap(([file, text]) => {
      const lines = text.split('\n');
      const found: string[] = [];
      let run = 0;
      lines.forEach((line, i) => {
        run = /^\s+\w+System\([^)]*\);/.test(line) ? run + 1 : 0;
        if (run === 3) found.push(`${file}:${i - 1}`);
        // The same list squeezed onto one line.
        else if ((line.match(/\b\w+System\(/g) ?? []).length >= 3) found.push(`${file}:${i + 1}`);
      });
      return found;
    });
    expect(handBuilt).toEqual([]);
  });

  // A comment says why, never where or how many: file names, owners and counts
  // go stale the moment code moves, and a moved file still compiles under a
  // comment that names its old home. Where things live is for imports and
  // tests; a comment points at a name (a function, a type), never a file.
  it('no comment names a source file', () => {
    const naming = code.flatMap(([file, text]) => text.split('\n')
      .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
      .filter(({ line }) => /\/\/.*\b[\w-]+\.ts\b/.test(line))
      .map(({ at }) => at));
    expect(naming).toEqual([]);
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
    'Dizzy.until': 'a hammer breaking mid-spin, and one spun too long; each sets a fresh deadline',
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
