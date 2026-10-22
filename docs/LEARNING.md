# Learning from this repo

This game was built by a designer and an agent working together, as the test bed for the skills in .claude/skills. The skills hold the rules and short examples; this repo holds the whole story: the code, the tests that keep it honest, the commit history, and the retro of where the skills fell short (SKILL-NOTES.md). If you're an agent about to build a game this way, read it as a worked example, not as a template to copy.

## Read in this order

1. CLAUDE.md at the root and in each zone: the rules that apply while you work here.
2. ARCHITECTURE.md: the zones, the tick order, the rules examples table, and a section per feature saying what was decided with the designer.
3. The skills, starting with their README: the workflow, then rules-and-simulation, game-implementation and game-design-interview.
4. SKILL-NOTES.md: every place the skills fell short, newest last, with what changed because of it. This is the most useful file in the repo for not repeating the same mistakes.

## Patterns worth copying, and where they are

| Pattern | Where | Why |
| --- | --- | --- |
| Rules, simulation and a seam between them, enforced by a lint | src/domain, src/ecs, src/bridge, .dependency-cruiser.cjs | Five features changed the rules by about a hundred lines: the rules didn't care about weapons or bosses |
| One function builds a level from rules state, for every level and any load | `buildArena`, src/bridge/run/load.test.ts | A load test builds a world from every rules state and checks it agrees with the rules |
| The tick order as data, shared by the game and the tests | `TICK_ORDER`, `stepper()` | A test can run fewer systems, never a different order or one the game skips |
| Randomness injected as one stream per job | `streams`, `Random` | A new random draw in one system can't change another's for the same seed |
| Fairness as property tests from the player's own numbers | src/ecs/bosses/generate.test.ts | 300 seeds, three bodies, five depths; caught three unfair ranges on the first run |
| A reviewer's eye as tests | src/structure.test.ts | Kind branches, shared writers, file names in comments, hand-built step lists, shared randomness, stale mutations |
| Mutations that prove tests can fail | tools/mutations/run.py | Each entry breaks one thing on purpose and expects a test to catch it |

## Mistakes worth learning from

Each is in SKILL-NOTES.md with the fix. The commits are easy to find with `git log --grep`:

- Tests written after the code, and tests whose first failure was a missing module: `git log --grep "test-first"`, and the structure checks commit.
- Files that grew past 700 lines, and the split by job behind a re-export: `git log --grep "split"`.
- A system that every test ran and the game never did: `git log --grep "tick order"`.
- One shared random generator: `git log --grep "stream"`.
- Design choices the agent made alone that were the designer's to make: the "ask the designer" skills commit.

## Known debt: do it differently in the next game

- **Weapon behaviour is fields on a definition** (`heldThrow`, `throwStyle`) read by large weapon systems. Better than the kind branches it replaced, but the ECS way is a component per behaviour (something that returns when thrown, something that spins on hold) and a small system for each.
- **Twenty-three fields have more than one writer**, each listed with a reason in structure.test.ts. The rule is one writer per field: everything else sends a request to a queue the owning system drains and validates.
- **Commits that don't build alone, and fixes that landed commits after their bug.** The history shows both. The next game keeps every commit self-contained.

## Reading the history

Features are one commit per layer (domain, bridge, ecs, app, tools, docs), each saying why. A commit that doesn't build on its own says so in its message, and the next one in the series fixes it. Checks that were added later were committed after the fixes they force, with their first failing output in the message, so you can see what they caught.
