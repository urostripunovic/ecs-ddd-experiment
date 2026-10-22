# Skills: from prototype to production

## How to use them

**Setting up a new game:**

1. Copy this folder (`.claude/skills/`) into the new repository.
2. Add a few lines to the root `CLAUDE.md`: where the zones are (rules, seam, simulation, app), the command to run before finishing (typecheck, tests, boundary lint, build), and a pointer to this README.
3. Set up a boundary lint from the first commit (for TypeScript, dependency-cruiser rules: rules import nothing, the simulation imports neither the rules nor the seam). The skills assume one exists.
4. Bring or write a playtest bot and recorder early: a bot that plays through the real input path, and a recorder that steps the game on a fake clock and saves frames. The gate to tickets requires one in the repo.
5. Create an empty `SKILL-NOTES.md` for incidents where the skills fell short.
6. Create `CODING_STANDARDS.md` with one line pointing the reviewer at `.claude/skills/rules-and-simulation/review.md`. Rules a reviewer applies live there, not in what loads while building.
7. After the first feature exists, ask to set up the checks (`game-checks-setup`). It writes the structure checks for this game's code and language, breaks each once to prove it works, and leaves the ones with nothing to guard yet as todo tests. The tidy step adds each of those when its code first appears.

**While prototyping**, just ask for features in plain words. `rules-and-simulation`, `game-design-interview` and `game-implementation` load on their own:

- "Add a dodge that makes you invulnerable for a few ticks."
- "The boss should drop down from a pillar when the arena starts."
- "What should happen if we die in the same tick as the boss?"

Expect each change to start with a predicted footprint and the invariants it touches, ask design questions only when the change raises one, and end with a playtest and a comparison with the prediction. If it doesn't, that's a line for `SKILL-NOTES.md`.

The prototype loop is the main use. Stay in it until the game is worth building on; everything below is optional and can wait.

**Later: when the prototype is worth building on**, run `/game-to-tickets` by name: "Cut tickets for three more arenas and a second boss." It checks the gate first and stops if the base isn't ready.

**Later: in production**, hand each ticket to a fresh session ("Implement ticket 03", with Matt Pocock's `implement` if you use it), then review with `code-review`, which reads `review.md` through `CODING_STANDARDS.md`. Each ticket's footprint is its blast radius: tickets with no blocking edge and no overlapping files can run side by side in separate git worktrees.

**How the skills improve: build a game with them.** The designer decides how the game feels; the agent builds it and says where the skills fell short. Each session's misses go in the game's `SKILL-NOTES.md`, and the next session (in that game or the next one) starts by folding them into the skills, as examples where an example helps. The skills should be wrong in new ways each time, not the same way twice.

**Now and then**, read `SKILL-NOTES.md`. A line that keeps coming back is an edit to a skill: missing → add it, vague → reword it, ignored though clear → enforce it with a test, a lint rule or a type.

## The cycle

Skills for games built as a simulation (ECS) plus a thin rules module. They plug into Matt Pocock's skills (`grilling`, `to-tickets`, `implement`, `tdd`, `code-review`) and the ddd-skill kit, and work without either.

| Phase | Goal | Skills | What carries forward |
| --- | --- | --- | --- |
| 1. Prototype | Find the fun; the design changes daily | `rules-and-simulation`, `game-design-interview`, `game-implementation` | Code, tests, examples tables, glossary, recorded decisions |
| 2. Vertical slice | One piece complete; the base worth keeping | the same two | The playtest bot in the repo; open items decided |
| 3. Gate and tickets | Cut the rest into pieces | `game-to-tickets` (gameplay), `to-tickets` (everything else) | Tickets that point at rows, never restate them |
| 4. Production | One ticket per session | `implement` + `tdd`, following `rules-and-simulation` and `game-implementation`; `game-design-interview` when a trigger comes up | Features, new examples rows, decisions |
| 5. Review | Before merge | `code-review`, reading `rules-and-simulation`'s `review.md` through `CODING_STANDARDS.md` | |

The loop: playtests and surprises go back to the interview (a decision), to `game-to-tickets` (a follow-up), or to the skills themselves.

- **`rules-and-simulation`**: the mechanics, true for any game built this way. Where state lives, the rules, the simulation, the seam, the test levels.
- **`game-design-interview`**: the decisions that differ per game, asked when a change touches them and recorded in the examples tables.
- **`game-implementation`**: writing the code itself: red with proof, green fast, then a tidy step before the commit; the structure checks that make a reviewer's eye automatic; how to split, when objects or injection help, and per-language cards. Works with Matt Pocock's `implement` and `tdd`.
- **`game-checks-setup`**: the structure checks: set up after the first feature, one more whenever a todo check's code appears, and when a retro adds a kind. Any language: what each check catches, how to write it from inside the test runner, and which tool fits in TypeScript, Go, Java and Rust.
- **`self-contained-commits`**: not about games; how every commit here is made. One thing per commit, each builds and passes alone, fixes folded into the commit that caused them, and every edit checked by its diff's size before its contents.
- **`game-to-tickets`**: the gate, then tickets with decisions, footprint, invariants and a playtest criterion. Run it by name, not automatically.

There's no prototype modelling phase: the prototype is the model (examples tables, glossary, architecture doc). Only a rules area that outgrows a page, or touches money, trades or long-lived saves, gets the ddd-skill kit: `ddd-modelling` (its examples table becomes the model's Examples), then `ddd-to-tickets`, `ddd-implementation` and `ddd-review-all` for that area alone. The simulation never goes through it.

| Area | Model | Tickets | Build | Review |
| --- | --- | --- | --- | --- |
| Simulation and small rules areas | the prototype itself | `game-to-tickets` | `implement` + `tdd`, following `rules-and-simulation` | `code-review` + `review.md` |
| A rules area that outgrew a page | `ddd-modelling` | `ddd-to-tickets` | `ddd-implementation` | `ddd-review-all` |
| Menus, settings, builds | none | `to-tickets` | `implement` | `code-review` |

**Improving the skills:** export the sessions and run Matt Pocock's `retro` over them now and then. It finds what nobody reports (failed commands, retried edits, tests that took three tries) and the friction lines each change ends with. Keep a short `SKILL-NOTES.md` for what you notice yourself while playing. For each pain point, find the rule that should have prevented it: missing → add it, vague → reword it, ignored though clear → enforce it with a test, a lint rule or a type.

**Docs convention:** in `docs/`, backticks mean "this name exists in the code". `src/docs.test.ts` checks every backticked name, so write plain words in plain text.

**Per-language cards** (brands, read-only projections, exhaustive switches, coroutines) live at the end of `game-implementation`: TypeScript now, Go, Java and Rust written while porting.
