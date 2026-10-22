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

## 2026-10-22: tests that pass for the wrong reason, shared randomness, asking

- **Tests stepped their own list of systems**, so a test could leave out a system the game runs, or run them in another order. The order is now data (`TICK_ORDER`), tests step a subset of it with `stepper()`, and a structure check fails on a hand-built list (three system calls in a row, or on one line).
- **One shared random generator** meant one new draw (the railgun's bloom) changed every later drop for a seed. Each job now has its own stream, passed in; a structure check fails if a system imports a shared source.
- **Design choices made alone**: one special weapon per level, haste for catching the chakram, chakram details. They changed how the game feels, so they were the designer's. game-design-interview now has "a choice a player would feel" as a trigger, and says to ask before building those; if the designer is away, build the smallest version, mark it experimental and lead the report with the question.
- **Files: 300 lines, tests included.** Test files had reached 400 lines; a long test file is where a wrong case hides.

## 2026-10-22: pushing pillars, and a mutation list that rotted

- **The mutation list rotted through the splits, unnoticed.** Moving code into folders turned 28 entries into silent skips and left others running tests that had moved, so they "missed". The run is too slow for every check, so nobody ran it after a refactor. Now the list is data (`tools/mutations/mutations.json`) and a fast structure test fails when an entry's text or tests are gone. Fed the old list, it flagged 29 problems.
- **Two blind tests in one feature, caught by the mutations.** One measured a pillar's angle against a baseline that forgot the ticks spent charging the throw, so it passed with no push code at all. The other said "a staggered boss starts nothing new" and checked only that it was idle, which it was anyway while walking. Both got caught: the first by adding empty stubs to see every test fail on its assertion, the second by a mutation. The empty-stub trick is worth keeping: a test that can only fail on a missing export has never been seen to fail.
- **Shared game streams leak between tests.** A test of how a dizzy player wanders started failing when new tests before it drew from the same stream. Tests that run the game's systems reseed the streams per case.
- **A mutation that can't be caught is a finding too.** Removing the "only orbiting pillars move" guard changed nothing, because fixed pillars are never moved anyway. The guard stays as defence; the mutation went.

## Retro, 2026-10-22: what went into the skills

Every note above, and where it ended up. The designer's feedback changed three of them.

| Note | Now in the skills |
| --- | --- |
| Tests written after the code, or in a batch | Proper TDD, one behaviour at a time, each test seen failing on its assertion (game-implementation, rules-and-simulation step 4) |
| Files grew past 700 lines | Split when a module loses its single job, not at a line count; report growth per stage. The 300-line check is gone: a count was the wrong test (designer's call) |
| Kind branches in every weapon system | The second `if` on a kind is a missing component: in ECS, which components an entity has is its behaviour (designer: "isn't the point of ECS that data is behaviour?") |
| Second writers crept in | Exactly one writer per field; everyone else sends a request to a queue the owner drains and validates (designer: one writer, a validating queue, not three actors) |
| Fixes three commits after the bug; commits that don't build alone | Commits are self-contained; a fix is folded into the commit that caused it before pushing (designer). Could become its own skill |
| A system the tick never ran | One tick order, shared with tests (already folded) |
| Shared random generator | One injected stream per job (already folded) |
| Design choices made alone | Ask before any choice a player would feel; if away, smallest version, experimental, question at the top of the merge request |
| Comments that said where | Comments say why, never where or how many; checked |
| Mutation list rotted through splits | Mutations as data with a fast staleness check; rerun slow checks after refactors |
| Blind tests (a forgotten baseline, "idle" for a stun) | "Tests that lie" lists both shapes; proper TDD makes a test that passes before its code exists visible at once |
| Shared streams leaking between tests | Reset a case's state when it starts, random streams included |
| A mutation nothing can catch | A finding: dead code to remove, or a missing test |
| Stale and cold dev server | Playtest tooling notes, generic |
| The skills named this repo | Skills stand alone, with generic examples; this repo is linked only by choice (docs/LEARNING.md) |

Not folded, on purpose: anything only true of this game (weapon names, the hammer, pillars), which stays in this repo's docs.
