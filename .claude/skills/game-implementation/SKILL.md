---
name: game-implementation
description: How to write and keep clean the code of a game built as a simulation (ECS) plus a thin rules module, while building a feature or a ticket. Use alongside rules-and-simulation (what goes where) and Matt Pocock's implement and tdd (the ticket loop), whenever writing, splitting or tidying simulation, seam or presentation code.
---

# Game implementation

`rules-and-simulation` says what goes where. This skill is about the code itself: writing it under pressure without it turning into spaghetti, and the checks that keep it clean when nobody is reviewing every line. It plugs into Matt Pocock's `implement` (one ticket per session) and `tdd` (red, green, refactor): his skills drive the loop, this one says what each step means in a game codebase. For a rules area big enough to model on its own, `ddd-implementation` covers that part instead.

Everything here comes from a session where an agent was left to build features on its own, and the code drifted: three files past 700 lines, "is this the hammer?" branches in every weapon system, fields with unlisted second writers, comments pointing at files that had moved, and stages where the tests were written after the code. None of it was hard to fix. All of it was easy not to notice, because the definition of done was "the feature works and the tests pass".

## The loop: red, green, tidy

1. **Red, and keep the proof.** Write the test, run it, and keep the failing line. It must be an assertion about the behaviour ("expected 1 to be 3"), not a missing module or a type error: a test that has only ever failed to compile has never been seen to catch anything. The line goes in the end-of-stage report; if you can't show it, say the test came after the code.
2. **Green, fast.** Shortcuts are allowed here: a special case, a long function, a constant inline. This is where the shape gets found, and pressure is fine.
3. **Tidy, as its own step, before the commit.** Re-read your diff as a reviewer would:
   - Did a file grow past its one job?
   - Did you branch on what kind of thing it is where a field on its definition would do?
   - Did a field gain a second writer, or a number a second copy?
   - Is any comment now false, or does any comment say where or how many?
   - Is there a shortcut you're keeping? Say so in the report.

   Tests and structure checks pass before and after, unchanged: a tidy changes shape, never behaviour. Minutes per stage; after five features the same cleanup is a session, and the next features have been built on the mess.
4. **Commit per layer, after the tidy.** If a lower layer's change means a commit doesn't build alone, say so in its message.

When a design question surfaces mid-feature, stop and ask it (`game-design-interview`); don't settle it in code. The ones that slipped through here looked like implementation details: one special weapon per level drawn from the seed, haste for catching a returning weapon, which way an overcharged shot misbehaves. Each changed how the game felt, so each was the designer's call. Ask before building them, or, if the designer is away, build the smallest version, mark it experimental and lead the report with the question.

## Make the reviewer's eye a check

An agent working alone optimises for what is checked. Make clean code checked. Set these up in the first week of a project, next to the zone lint; each one here exists because its absence let something through:

| Check | Fails when | Caught here |
| --- | --- | --- |
| Line limit (about 400) | Any source file is longer | three files over 700 lines |
| No kind branches | A system compares against a kind (`=== WeaponKind.Hammer`) outside its definitions table | a branch per weapon in the throw, attack and durability code |
| Shared writers are listed | A field is written from more than one module and isn't in a list with its reason (entity construction and dev tools don't count) | a field documented as single-writer that had two |
| No file names in comments | A comment names a source file | a comment pointing at a file that had become a folder |
| The tick calls every system | An exported system is missing from the tick, or from the architecture doc's order | a damage-over-time system that every unit test ran and the game never did |
| Docs drift | A name in backticks in the docs doesn't exist in the code | |

Scan the source as text (in Vite, `import.meta.glob` with `?raw`), so the checks need no Node types and run with the other tests. Break each check once on purpose before trusting it.

## Splitting

- **Split by job, not by size.** Size is the alarm; the cut follows what the code does. A weapons file became items (the states and moving between them), follow, throwing, attacks, flight, pickup and upkeep. Boss scripts became shared moves, bullet patterns, the hand-made bosses and the generated ones.
- **Keep the old module as a re-export**, so the tick, the seam and the tests import exactly as before, and the split is one commit with no behaviour change.
- **Split mechanically.** Move whole top-level declarations with a script, let the compiler list unused imports, and prune. Hand-editing a 700-line file costs more time and context than writing the script, and a script doesn't silently change a line. Check where comments landed afterwards: a section header above the last declaration of one group belongs to the next.
- **Expect the split to reveal sharing.** One big file hides that two parts write the same field; the writers check will find them once they're modules. Either give the field one writer (an `emptyHand()`, a `begin()` that sets the windup) or list it with its reason.

## Behaviour is data, not branches

When a system asks "is this the X?", the answer belongs on X's definition: `heldThrow: 'charge' | 'spin'`, `throwStyle: 'stick' | 'return' | 'smash'`, which perks a weapon carries out. The system reads the field; adding a new kind is a new row, not a new branch in four systems. A behaviour too different to be a field (a whole attack) is a value of a field (`attack: 'arc' | 'shoot' | 'rail' | 'spray'`) handled in one exhaustive switch.

## Objects, functions, injection

ECS rules out one kind of object: per-entity state with its own methods. Everything else is a choice.

- **Simulation state:** flat arrays, as `rules-and-simulation` says. Never a class per entity.
- **Choreography:** generator functions, one step per tick. A class buys nothing.
- **Presentation and tools:** classes are fine and often right. A renderer is objects all the way down and never feeds back, so a `Telegraphs` class that owns its meshes and pools, with `draw()` and `hide()`, is cleaner than another closure in an 800-line function.
- **Definitions:** plain readonly data.
- **Dependency injection** pays where a test or a replay needs to swap something: randomness (a seeded source passed in, so one new random call doesn't shift every later draw), time, and a script's view of the world (`{ findPlayer, shoot }`, so a boss script tests without an arena). Not in per-tick loops, where it adds indirection and allocation.

## Comments say why, never where or how many

A comment that names a file, claims to be "the only writer", or counts things that grow is a fact the code can change under it, and it will still compile. Point at a name (a function, a type) or leave location to imports, and put "who writes this" in the writers check. What a comment is for: the reason behind a choice ("the release is a counter, so a tap shorter than a frame still throws") and decisions from the design interview ("decided with the user: nothing hurts after a clear").

## Tests that lie

- **A test with its own step list** can pass while the game never runs the system. Keep one test that compares the tick against every exported system.
- **State leaking between cases** in a long-run harness: hp, positions or projectiles from an earlier action make a later assertion fail or pass for the wrong reason. Reset what the case asserts on, at the moment it starts measuring.
- **Fairness and other property tests** must compute their limits from the player's own numbers (speed, dodge length, radius), never from the generator's ranges, or they only check the generator against itself.
- **Mutations** prove a test can fail; they don't replace seeing it fail first.

## Working cheaply

Context is a budget. The biggest costs are reading large files in full again and again, edits that resend big blocks, and images.

- Read the slice you need (a function, a range of lines), not the file.
- Small files are cheaper to read and to edit; that's another reason to split.
- Mechanical changes (renames, splits, moving a branch into a field) go through a script.
- In playtests, read the probe log first; look at a few frames only when the log can't answer.

## Playtest tooling

- Restart the dev server after changing modules the bot imports, or it reads stale code.
- The first recording against a freshly started server may freeze; load it once before recording.
- The bot lags behind features. When a mechanic only triggers on a choice (overcharging, breaking a weapon mid-spin), either teach the bot or say in the report that only tests cover it.

## Per language

- **TypeScript:** branded units at the edges, typed arrays strip brands (re-brand with the checking constructor, never a cast), `Readonly<>` projections with the writable side behind the zone lint, `assertNever` in every switch, type-only imports under `verbatimModuleSyntax`, `noUnusedLocals` to make a mechanical split's leftovers loud.
- **Go, Java, Rust:** to be written while porting. Each card covers the same points: flat arrays, coroutines (or their replacement), exhaustive switches, read-only projections, and how to write the structure checks.
