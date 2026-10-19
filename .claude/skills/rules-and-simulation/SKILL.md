---
name: rules-and-simulation
description: Design and change games (or any real-time system) built as a fast simulation (ECS) plus a thin rules module. Use when adding or changing gameplay features, deciding where state lives, or reviewing such a change.
---

# Rules and simulation

A game built this way has two halves and one seam between them:

- **The simulation** runs every tick: movement, collision, attacks, timers, animation state. Flat data, plain systems, a fixed tick order.
- **The rules** decide what is *true* in a way that matters beyond the next tick: which level you're on, whether a fight is won, what you carry, anything a save would hold. Pure functions, no engine, no clock but the tick.
- **The seam** (the bridge) turns what the simulation saw into requests to the rules, and the rules' decisions back into plain values the simulation reads.

The simulation is the default. Most features never touch the rules, and that is a good sign.

## Before writing code

Do these, in order, and write the first two down where the reviewer will see them (the PR, or a message before you start).

1. **Predict the footprint.** List the files you expect to change, per layer (rules, seam, simulation, app, docs), and which existing tests you expect to break and why. After the change, compare. A miss is fine; an unexplained miss is a review question.
2. **List the invariants the change touches.** Things that must stay true, for example: "an item is in exactly one state", "one writer per field", "nothing spawns unless fighting", "a new level is built only from rules state". If a change touches an invariant, it gets a test.
3. **Write the failing test first** for the new behaviour, and check it fails for the right reason. A test that passes before the change proves nothing.
4. **Build layer by layer**, one commit per layer: rules, seam, simulation, app, docs. Each commit message says *why*.
5. **Playtest.** Watch it run (a bot playing headless is enough) and look at frames. Balance, feel and "it works but it's wrong" only show up here. Playtesting is part of the change, not after it.
6. **Compare** the prediction with what actually changed, and say so in the PR.

Invariants in gameplay code follow the design. When the design changes, change the invariant and its test on purpose; don't let it drift.

## Where does it live? Ask what reacts

For every new piece of state, ask: **what reacts to it?**

| What reacts | Where it lives | Example |
| --- | --- | --- |
| Only the simulation's own maths | simulation | a speed buff, a slow, durability, ammo, a boss's attack pattern |
| A rule, a save, or another area of the game | rules | which level you're on, a fight won or lost, what carries to the next level |
| Both, at different levels | split, with different names | a suspicion meter (simulation) that, when full, raises an alert (rules) |

Start in the simulation. Move something into the rules only when a reaction appears. Moving in later is cheap; moving out is painful.

Signs something is in the rules but shouldn't be:
- a request that fires many times a second;
- the rules holding a value that changes every tick;
- a decision with no conditions that always says yes;
- a projection that copies many fields one-to-one.

When the rules set a *mode*, the simulation already knows how to behave in it. "Nothing spawns once the boss is dead" needs no new rule if spawning already runs only while fighting. The rules set `Cleared`; the simulation reads it.

## The rules module

Plain words are used here; the formal terms are in brackets for people who know them.

- **An area owns its words** [bounded context]. Each area is one folder: `boss/`, `run/`. When one word starts meaning two things, that's two areas.
- **A rules unit** [aggregate] is the state that must stay consistent together, changed only through two pure functions:
  - `decide(request, state) → facts`
  - `apply(state, fact) → state` [evolve]
- **Requests and facts are named differently** [commands and events]. Requests are attempts or observations (`TunnelEntered`, `ThresholdCrossed`); facts are decided outcomes, in the past tense (`ArenaEntered`, `PhaseReached`). Only the rules produce facts.
- **Every request that waits for an answer gets exactly one,** yes or no. A refusal is a fact (`TunnelRefused`), because something on the simulation side is usually waiting on it. "No facts" only means "already answered".
- **One area reacts to another through a follow-up** [process manager]: a fact in one area becomes a request in another (`BossDefeated` → `BossCleared` for the run), never one area reaching into another's state.
- **Time arrives as a request.** Deadlines are stored as ticks, never counted down. The only clock is the tick, never wall time.
- **Things the rules keep get stable names** [identity]: `BossId`, `WeaponId`. Simulation positions (entity handles) are recycled and never enter the rules. Something born in the simulation gets its name the first time it crosses into the rules.
- **Every case is handled, and the compiler says where.** Every switch on a request or fact kind ends in an exhaustiveness check, so adding a kind breaks the build everywhere it must be handled.

Tests for the rules: given a state and a request, expect these facts. No simulation, no engine.

## The simulation

- **Data in flat arrays**, one array per field, indexed by entity. Per-kind numbers (a weapon's damage) live in a definitions table, not on every entity.
- **Every system starts with `reads … | writes …`.** The tick order is written down in one place, not implied by imports.
- **One writer per field.** When two things affect one value (a buff and a slow on speed), each gets its own field and the reader combines them. Otherwise one silently erases the other.
- **Inputs that must not be lost or doubled are counters.** The input layer only increments; the simulation records what it has acted on.
- **Sensors fire on the edge and latch** until answered: "started overlapping", not "is overlapping".
- **Effects with a duration are deadlines** (`until: tick`), read where needed; nothing counts them down.
- **Lifecycles are exclusive states with one function per transition.** For example, an item is grounded, held, flying or stuck; `putOnGround()` is the only way onto the ground, so its rules (never inside a pillar) hold everywhere.
- **Actions run one at a time, and the gaps between them are data.** A boss's attacks run through `begin()`/`finish()`; when the next may start is a table per phase, not waits scattered through scripts.
- **Coroutines are for choreography that is never saved.** Anything that must survive a save is a state component.
- **Store handles, never positions.** An entity's slot is reused; a handle (slot plus generation) goes stale instead of pointing at the wrong thing. Logs and test assertions name things by stable ID, never by slot.
- **Randomness is seeded.** The same seed and inputs give the same run, which is what makes runs comparable and bugs reproducible.
- **Helpers never borrow their caller's scratch buffer.** If a helper queries while its caller is iterating, it uses its own buffer.
- **Presentation is derived.** The simulation stores *which* action and *since when*; how it looks is a pure function in the renderer. Nothing the renderer does (camera shake, interpolation) feeds back into the simulation. Undo a shake before aiming through the camera.

## The seam

- **The outbox lives on the simulation side**, so the simulation never imports the seam; the seam drains it once per tick.
- **The rules run once per tick, synchronously,** after the simulation and before rendering, so a decision is applied before anything is drawn.
- **Projections write plain values** into components the simulation reads (`RunView`, `BossPhase`). They never send requests, so loops are bounded by the tick.
- **A level is built only from rules state** [spawn projection], by one function used for the first level and every one after it. That's also what a save/load would use. Rebuilding the world waits until the rules step has finished.
- **Identity mapping lives only here**: handle ↔ stable ID.
- **A dev-only log records each chain**: request → fact → what was written. It answers "where did this come from?" without a debugger.
- **Boundaries are enforced by a lint**, not by review: the rules import nothing; the simulation imports neither the rules nor the seam.

## Tests, in four levels

1. **Rules:** state + request → facts.
2. **Seam:** push a request in, assert the component values that come out.
3. **Simulation:** one system or a slice of the tick in isolation, and long-run property checks. For example, run 4,000 ticks and check every gap between boss actions, or that nothing fires mid-air.
4. **Whole game:** headless runs compared for determinism (twice with the same seed; uneven frame times against a steady rate), plus a bot playthrough with recorded frames for what only play reveals.

A new test must fail before the change. Check thresholds against the right base (relative rules need relative tests), and count only what the test means (*my* bullet, not all bullets).

## Review checklist

- [ ] Prediction written before the change, and compared after.
- [ ] Every piece of new state passed "what reacts?", and the answer is in the PR.
- [ ] Invariants touched are listed, each with a test.
- [ ] Every new request gets exactly one answer.
- [ ] No field has two writers.
- [ ] One commit per layer; boundary lint passes.
- [ ] Playtested, with frames or a short video, and anything the playtest found is fixed or noted.

## Not covered yet

- **Language mapping.** How to express flat arrays, coroutines (or a state component where there are none) and exhaustive switches in Go, Java, Rust or C#. For now the reference implementation is TypeScript.
- Networked play: rolling back the rules alongside the simulation.
- Saves: writing and loading rules state through the spawn projection.
