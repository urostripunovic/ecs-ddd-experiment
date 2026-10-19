# Skills: from prototype to production

Three skills for games built as a simulation (ECS) plus a thin rules module. They plug into Matt Pocock's skills (`grilling`, `to-tickets`, `implement`, `tdd`, `code-review`) and the ddd-skill kit, and work without either.

| Phase | Goal | Skills | What carries forward |
| --- | --- | --- | --- |
| 1. Prototype | Find the fun; the design changes daily | `rules-and-simulation`, `game-design-interview` | Code, tests, examples tables, glossary, recorded decisions |
| 2. Vertical slice | One piece complete; the base worth keeping | the same two | The playtest bot in the repo; open items decided |
| 3. Gate and tickets | Cut the rest into pieces | `game-to-tickets` (gameplay), `to-tickets` (everything else) | Tickets that point at rows, never restate them |
| 4. Production | One ticket per session | `implement` + `tdd`, following `rules-and-simulation`; `game-design-interview` when a trigger comes up | Features, new examples rows, decisions |
| 5. Review | Before merge | `code-review`, plus `rules-and-simulation`'s checklist | |

The loop: playtests and surprises go back to the interview (a decision), to `game-to-tickets` (a follow-up), or to the skills themselves.

- **`rules-and-simulation`**: the mechanics, true for any game built this way. Where state lives, the rules, the simulation, the seam, the test levels.
- **`game-design-interview`**: the decisions that differ per game, asked when a change touches them and recorded in the examples tables.
- **`game-to-tickets`**: the gate, then tickets with decisions, footprint, invariants and a playtest criterion. Run it by name, not automatically.

There's no prototype modelling phase: the prototype is the model (examples tables, glossary, architecture doc). Only a rules area that outgrows a page, or touches money, trades or long-lived saves, gets the ddd-skill kit: `ddd-modelling` (its examples table becomes the model's Examples), then `ddd-to-tickets`, `ddd-implementation` and `ddd-review-all` for that area alone. The simulation never goes through it.

| Area | Model | Tickets | Build | Review |
| --- | --- | --- | --- | --- |
| Simulation and small rules areas | the prototype itself | `game-to-tickets` | `implement` + `tdd`, following `rules-and-simulation` | `code-review` + our checklist |
| A rules area that outgrew a page | `ddd-modelling` | `ddd-to-tickets` | `ddd-implementation` | `ddd-review-all` |
| Menus, settings, builds | none | `to-tickets` | `implement` | `code-review` |

**Improving the skills:** keep a `SKILL-NOTES.md` in each game repo, one line per incident: what happened, which rule, and whether the rule was missing, vague or ignored. Missing: add it. Vague: reword it. Ignored though clear: enforce it with a test, a lint rule or a type.

**Later:** per-language cards (brands, read-only projections, exhaustive switches, coroutines in Go, Java, Rust), written while porting, read only during implementation.
