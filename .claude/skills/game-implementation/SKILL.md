---
name: game-implementation
description: How to write and keep clean the code of a game built as a simulation (ECS) plus a thin rules module, while building a feature or a ticket. Use alongside rules-and-simulation (what goes where) and Matt Pocock's implement and tdd (the ticket loop), whenever writing, splitting or tidying simulation, seam or presentation code.
---

# Game implementation

`rules-and-simulation` says what goes where. This skill is about the code itself: writing it under pressure without it turning into spaghetti, and the checks that keep it clean when nobody reviews every line. It plugs into Matt Pocock's `implement` (one ticket per session) and `tdd` (red, green, refactor). For a rules area big enough to model on its own, `ddd-implementation` covers that part instead.

Left alone, an agent's code drifts in predictable ways: one system collects a special case per item or enemy type, fields gain writers in several places, comments point at files that moved, tests get written in a batch after the code, and fixes land three commits after the bug. None of it is hard to fix. All of it is easy not to notice when "done" means "it works and the tests pass", so this skill makes the rest of "done" explicit, and checked where it can be.

## The loop: proper TDD, one behaviour at a time

1. **Red.** Write one test for one behaviour. Add only enough code for it to compile (an empty function, a field) and run it: it must fail on its assertion ("expected 1 to be 3"), never on a missing import. Keep that line for the report. A test that has only ever failed to compile has never been seen to catch anything.
2. **Green.** The least code that makes it pass. Shortcuts are fine here; this is where the shape gets found.
3. **Refactor.** Tests unchanged, shape improved (see the tidy questions below). Then the next behaviour, from step 1.

Not a batch of seven tests followed by the code: written together, tests share the same blind spot, and one that passes before its code exists hides among the others. If a new test passes at once, it's blind or the behaviour already exists; find out which before going on.

**Tidy before every commit.** Re-read the diff as a reviewer would:
- Does any module now do more than its one job? Say it in one sentence (see Splitting). Size is a hint, not the test.
- Did you write a second `if` on what kind of thing an entity is? That's a missing component (see below).
- Does any field now have a second writer, or any number a second copy?
- Is any comment now false, or does any say where or how many?
- Is there a shortcut you're keeping? It goes in the report, and in the merge request.

## Commits

How commits are made (one thing each, each builds and passes alone, fixes folded in before pushing) is `self-contained-commits`. Here that means a feature's commits come after its tidy step, never straight from green.

## Data is behaviour: compose, don't branch

ECS's answer to "how does this kind of thing behave?" is which components the entity has. A system runs on everything that has its components and knows nothing about kinds. So:

- **A behaviour is a component (often a tag) and a system,** added to the entities that do it: something that comes back when thrown gets a returning component, something that burns gets a burning one. A new kind is a new combination of components, not a new branch in four systems.
- **Definitions tables hold numbers,** the tuning for each kind (damage, speed, how long), not switches that decide behaviour.
- **The second `if` on a kind is the signal.** One special case is fine while finding the shape; the second branch on the same distinction means a component (or, outside the per-tick systems, an injected behaviour) is missing. Stop and add it.

## Writers: one per entity, in a known order; requests where sources combine

ECS engines (Bevy, Unity's DOTS) let several systems write the same component. What makes that safe is a fixed order: Bevy, for one, reports systems that write the same data with no order between them. The danger isn't two writers, it's two writers whose order is implicit or whose way of combining is an accident. So:

- **One writer per field per entity, in the tick's known order.** Different kinds of entity can have different writers (players moved by input, enemies by their scripts); each entity has one.
- **Set, then count down, is fine:** one system starts a timer, another runs it out.
- **Where several sources must combine on the same entity** (damage, shoves, speed effects, screen shake), they send requests: a queue or an event buffer, as engines do for damage events and deferred commands. One system applies them with an explicit policy (sum them, strongest wins, latest wins) and validates them (immunity, caps).

A check lists every field written from more than one module, each with its reason. A reason has to be one of the three above; "several sources combine" without a queue is debt, and the list says so.

## Objects, functions, injection

ECS rules out one kind of object: per-entity state with its own methods. Everything else is a choice made by what needs doing:

- **Simulation state:** flat arrays. **Behaviour:** systems over components.
- **Choreography** (an enemy's attack pattern): generator functions, one step per tick.
- **Presentation and tools:** classes are fine and often right; a renderer owns meshes and pools and never feeds back.
- **Dependency injection** where a test or a replay must swap something, or where something shared would leak: randomness above all (one seeded stream per job, passed in, or one new random draw anywhere shifts every later one for the same seed), time, and a script's view of the world. Not inside per-tick loops.
- **The world itself** may be a module-level value while the game has one. Tests reset it per case, and that's the cost. The day there are two (rollback for netcode, a server and client in one process, tests run in parallel), pass it in. Decide that before the first networked feature: it touches every system's signature, and a late change is a session of its own.

## Splitting

- **Split when a module loses its single responsibility,** not at a line count. In ECS a system's one job is one transformation: what it reads and what it writes. Four signals that it has more than one:
  - it writes components that have nothing to do with each other;
  - it branches on what kind of thing it's looking at (each branch is a job, usually a missing tag);
  - it changes for features that have nothing to do with each other (churn);
  - its tests need setups that share nothing.
- **An "or" in the sentence is the split asking:** "a throw, a spin, or the special shot" is three jobs agreeing to share a file. Fine for now; say so in the report.
- **Make the signals ask, not fail.** A check counts the kinds of component each module writes and its lines; past a threshold, the module must state its one job in a sentence next to the check. If you can't write the sentence honestly, that's the split. An entry that's no longer needed fails too, so the list can't rot. A threshold that fails outright gets met by cutting at a line number, which is worse than not splitting.
- **Report each stage:** which files changed, how much each grew, and which files the last few dozen commits keep touching. A file that grows every stage, or that every feature touches, is the one to ask about. A split resets a file's history, so churn means little right after one.
- **Keep the old module as a re-export,** so importers don't change and the split is one commit with no behaviour change.
- **Split mechanically,** with a script that moves whole declarations, then let the compiler list what's unused. Check the result: a script can strip more than it should, and comments can land on the wrong side of a cut.
- **Expect the split to reveal sharing:** two parts writing the same field show up once they're separate modules. Route them through one writer.
- **Rerun the slow checks after a refactor** (mutations, long property runs). A moved function turns a mutation into a silent skip.

## Comments say why, never where or how many

A comment that names a file, claims to be "the only writer", or counts things that grow will still compile after the code changes under it. Point at a name, or leave location to imports and tests. A comment is for the reason behind a choice and for decisions the designer made ("decided with the designer: nothing hurts after a clear"). A check fails on a comment that names a source file.

## Tests that lie

- **A test that steps its own list of systems** can pass while the game never runs one. Tests step a subset of the game's one tick order.
- **State leaking between cases:** positions, hit points, projectiles or random-stream positions left by an earlier case. Reset what a case depends on when it starts, the game's random streams included.
- **A baseline that forgets something:** "moved further than it would have without the push" must count every tick the thing moved, including setup.
- **An assertion that can't tell the difference:** "the stunned enemy starts nothing" checked as "it's idle" passes for an enemy that was idle anyway. Assert what only the behaviour would change.
- **Property tests** take their limits from the player's own numbers (speed, dodge length, radius), never from the generator's ranges.
- **Mutations prove a test can fail.** Keep the list as data, with a fast test that every entry still finds its text and its tests exist, because the full run is too slow for every check. A mutation nothing catches is a finding: dead code to remove, or a missing test.

## Make the reviewer's eye a check

An agent working alone optimises for what is checked, so what a reviewer would catch by eye (a system the game never runs, a second writer, a branch per kind, a comment naming a file) becomes a test that runs with every other test. `game-checks-setup` lists the checks, says when to add them and how to write each in any language. Every check is broken once on purpose before it's trusted.

## Design questions mid-feature

Stop and ask (`game-design-interview`); don't settle them in code.

The other way round too: **a suggestion from the designer is a proposal, not an instruction.** Check it against how established engines and practice handle the same problem, then say whether you agree and where you'd differ, before writing it into a rule. Adopting it silently looks helpful and isn't; it's how a rule ends up stricter than anyone meant. Watch for the ones that look like implementation details: how often a new item turns up, a bonus for using something well, what happens when a mechanic is misused or overused. If the designer is away, `game-design-interview` says what to build in the meantime.

## Working cheaply

Context is a budget: read the slice you need rather than the whole file, make mechanical changes with a script, and read a playtest's log before its frames.

## Playtest tooling

Restart the dev server after changing modules the bot imports, or it reads stale code; warm a freshly started server with one throwaway load before recording. The bot lags behind features: when a mechanic only triggers on a choice, teach the bot or say that only tests cover it.

## Per language

- **TypeScript:** branded units at the edges; brands survive parameters but not arithmetic, and typed arrays strip them (re-brand a read value with the checking constructor, never a cast); `Readonly<>` projections with the writable side behind the zone lint; `assertNever` in every switch; `noUnusedLocals` to make a mechanical split's leftovers loud; in Vite, `import.meta.glob` with `?raw` to scan source in tests. Cross-zone names: declare `Record<RulesName, number>` (a missing name is a compile error), derive the way back with one `invert()` into a `Map` (so `.get()` is honestly `T | undefined`), and throw on a miss. Never type an indexed lookup as total, such as `readonly (Name | null)[]`: past the end it's `undefined` at runtime whatever the annotation says, and a filter on `!== null` lets it through as a `Name`. `noUncheckedIndexedAccess` would catch it everywhere, but also flags every typed-array read in a flat-array simulation, so honest `Map` lookups at the seam are the cheaper fix.
- **Go, Java, Rust:** to be written while porting. Each card covers flat arrays, coroutines (or their replacement), exhaustive switches, read-only projections, request queues, and how to write the structure checks.
