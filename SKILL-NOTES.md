# Skill notes

Incidents where the skills fell short. A line that keeps coming back becomes an
edit to a skill, a test, a lint rule or a type (see `.claude/skills/README.md`).

## 2026-10-21: Stage B, the special weapons, Stage C

- **Failing tests weren't always written first.** Stage B was test-first. The special weapons' tests were written first but only ever failed with "module not found", which proves nothing. Stage C's generator and its charge, sweep and orb scripts were written before their tests. Mutations afterwards proved the tests can fail, but not that the design was shaped by them. Why: for features with new data shapes, designing in code first felt faster. Fix: step 4 now asks for the failing output in the end-of-stage report, so a skipped red is visible without reading code.
- **Files grew past 700 lines unremarked.** `weapons.ts`, `boss-scripts.ts` and `scene.ts`. Nothing called growth friction. Fix: `structure.test.ts` fails past 400 lines, and the skill names a file outgrowing its job as friction.
- **Weapon behaviour drifted into kind branches.** "Is this the hammer / the gun / the sword?" in the systems, one more per weapon. Fix: `structure.test.ts` forbids comparing against `WeaponKind` outside the weapon definitions; behaviour moves into definition fields.
- **Second writers crept in unlisted.** Including one I'd documented as having a single writer (`Dizzy.angle`). Fix: `structure.test.ts` requires every field written by more than one module to be listed with its reason.
- **A system was never called by the tick** (`burnSystem`), and every test still passed, because each test builds its own step list. Fixed earlier the same day with `loop.test`.
- **The playtest bot read stale modules** after source edits until the dev server was restarted, and the first of several parallel recordings sometimes froze at tick 10. Both are known gotchas; the second has no fix yet. Workaround: stagger recordings. Seen again after the split: it is the first recording after a server start (a cold server), not parallelism. Workaround: warm the server with one throwaway load first; a real fix is for the recorder to reload when the tick hasn't moved.

## 2026-10-21: the cleanup pass

- **Splitting by file made hidden sharing visible.** Once `weapons.ts` became seven modules, the writers check found fields written from two places that one big file had hidden: the throw sets `Thrown` and flight changes it; the hand was emptied in two places. Some are listed with reasons now; the hand goes through `emptyHand`, and an action's windup through `begin()`.
- **Option, not done: dependency injection** for randomness and for the boss scripts' view of the world. Today every system reads module-level singletons, which is why tests reset the world and why one new random call shifts every later drop for a seed.

## 2026-10-22: tidy step and comments

- **Pressure is fine; skipping the tidy is not.** Building fast and a little ugly is how a feature's shape gets found. What went wrong was going straight from green to commit. rules-and-simulation now has a tidy step (7) between the playtest and the comparison, with the questions to ask of the diff, and commits come after it.
- **Comments that said where or how many went stale.** "The weapons are in weapons.ts" survived the split because the old file still compiled as a re-export. 19 comments named a file, and one was left behind by the splitting script on the wrong module. The rule is now: comments say why, never where or how many; `structure.test.ts` fails on a comment naming a source file, and "the only writer of" claims became reasons, with the writers check holding the fact.
