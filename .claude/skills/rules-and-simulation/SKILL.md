---
name: rules-and-simulation
description: Design and change games (or any real-time system) built as a fast simulation (ECS) plus a thin rules module. Use when adding or changing gameplay features, deciding where state lives, or reviewing such a change.
---

# Rules and simulation

The simulation is the world. The rules are fate. The bridge is how fate shows up in the world.

- **The simulation** runs every tick: movement, collision, attacks, timers, animation state. Flat data, plain systems, a fixed tick order. It is the default.
- **The rules** decide what other parts of the game depend on: which level you're on, whether a fight is won, what you carry. Pure functions, no engine, no clock but the tick.
- **The seam** turns what the simulation saw into requests to the rules, and the rules' decisions into plain values the simulation reads.

This skill holds the mechanics, which are true for any game built this way. Decisions that depend on the game (can you die after a clear, what wins a trade, where a restart begins) are asked, not assumed: see the `game-design-interview` skill.

## Before writing code

1. **Read the code you'll touch, then predict the footprint**: the files per layer (rules, seam, simulation, app, docs) and the existing tests you expect to break. A guess made before reading is a worse number; say so if you give one.
2. **List the invariants the change touches**, checked against the code, each with a test. They follow the design: when it changes, change the invariant and its test on purpose.
3. **Ask what the change leaves open.** If it touches a trigger in `game-design-interview`, ask those questions before building.
4. **Write the failing test first**, and check it fails for the right reason.
5. **Build one commit per layer**: rules, seam, simulation, app, docs. Each says *why*.
6. **Playtest.** A bot playing headless, with frames to look at. Feel and "it works but it's wrong" only show up here.
7. **Compare** the prediction with what changed, and explain each miss.

### With a ticket

When a ticket from `game-to-tickets` drives the work (often through Matt Pocock's `implement`):

- The ticket's footprint and invariants are steps 1 and 2: read the code, check them, and say where you disagree before building.
- A ticket with open questions waits for `game-design-interview`. A trigger found mid-ticket is asked then, and its answer recorded before the ticket closes.
- Step 4's loop can run through Matt Pocock's `tdd`; the test levels below say which tests a game change needs.
- Steps 6 and 7 still apply: the ticket's playtest criterion, and its footprint compared with what changed.

## Where does it live? Ask what reacts

| What reacts | Where it lives | Example |
| --- | --- | --- |
| Only the simulation's own maths | simulation | a buff, a slow, durability, ammo, a boss's phases and attacks |
| Another area's rules, or a decision a save must not get wrong | rules | the level you're on, a fight won or lost, what carries over |
| Both, at different levels | split, with different names | a suspicion meter (simulation) that, when full, raises an alert (rules) |

Being saved is not a reaction: simulation state serializes too. Start in the simulation and move something into the rules when a reaction appears; moving in later is cheap, moving out is painful. Signs something is in the rules but shouldn't be: a request many times a second, a value that changes every tick, a decision that always says yes, a projection that copies fields one-to-one.

When the rules set a *mode* (`Fighting`, `Cleared`), the simulation already knows how to behave in it, and never asks permission per tick.

Once the rules side outgrows a few areas, or touches real money, trades between players or long-lived saves, model that part with a domain-modelling process (for example `ddd-modelling`) and leave the simulation out of it.

## The rules

Plain words here; the formal terms are in brackets.

- **An area owns its words** [bounded context], one folder each. One word meaning two things is two areas.
- **A rules unit** [aggregate] changes only through `decide(request, state) → facts` and `apply(state, fact) → state`.
- **Requests and facts are named apart** [commands, events]: `TunnelEntered` asks; `ArenaEntered`, past tense, is decided.
- **Every request is answered in every state the rules can be in.** A refusal is a fact (`TunnelRefused`). "No facts" means "already answered", so a repeated request is harmless. Whether a request *can* arrive in a state is the simulation's design choice; the rules answer it anyway, so that choice can change without a softlock.
- **One area reacts to another through a follow-up** [process manager]: `BossDefeated` becomes a request to the run, never one area reaching into another.
- **Time arrives as a request; the tick is the only clock.**
- **Things the rules keep get stable IDs.** Entity handles never enter the rules; something born in the simulation gets its ID when it first crosses.
- **Every switch ends in an exhaustiveness check**, so a new kind breaks the build where it must be handled.
- **A short, numbered examples table per area**: state, request, facts, the test that pins it. Rows are never renumbered; removed rows leave gaps. Decisions from the interview land here.

## The simulation

- **Flat arrays per field; per-kind numbers in definitions tables.** Numbers that appear together become a named definition (`slam(boss, PHASE_ONE_SLAM)`, never `slam(boss, 42, 4.5, 30)`).
- **Every system starts with `reads … | writes …`**, and the tick order is written in one place.
- **One writer per field.** Two effects on one value get two fields, combined by the reader.
- **Inputs that must not be lost or doubled are counters**; sensors fire on the edge and latch until answered.
- **Durations are deadlines** made with one helper (`after(ticks)`), never countdowns.
- **Every piece of state declares its lifetime**: the level, the run, or forever. A new level wipes level state from that list, and a test fails if something is in no list.
- **Units are types at the edges**: durations, moments, seconds, hit points, shares, distances, in definitions and signatures. The hot loops read plain numbers. A brand is a value object without the object. Constructors reject impossible values when they're made.
- **Lifecycles are exclusive states with one function per transition** (`putOnGround()` is the only way onto the ground).
- **Actions run one at a time; the gaps between them are a table.**
- **Coroutines are for choreography that is never saved.**
- **Store handles, never slots; name things by stable ID in logs and tests.**
- **Randomness is seeded**, so a seed and inputs replay a run.
- **Presentation is derived and never feeds back.** Undo a camera shake before aiming through the camera.

## The seam

- **The outbox lives on the simulation side**; the seam drains it.
- **A tick is the unit of change.** The rules run once per tick, synchronously, before rendering; every fact of a decision applies in that step, and observers (renderer, save, network) only look between ticks. The tick never waits on anything: predict and correct, or show a waiting mode.
- **Projections are read-only to everyone but the seam**, like a read-only replica: the projection is exported read-only, its writable side from one module only the seam may import, enforced by the boundary lint. Without read-only types, a source scan test is the fallback.
- **A level is built from rules state by one function** [spawn projection], for the first level, every level after it, and any load. It builds from **every** rules state, not only the ones play reaches: a level loaded after its boss died has the boss down and the exit open. Rebuilding waits until the rules step ends. Simulation state that honestly lives for the whole run (the tick, the RNG's position, input counters, handle generations) is listed, not hidden.
- **Identity mapping lives only here.** A dev-only log records each chain: request → fact → what was written.
- **Boundaries are enforced by a lint**, not by review.

A save holds the rules state, the RNG's position if loads must replay exactly, and any simulation state the design keeps. Loading is the spawn projection, never a second path.

## Tests, in four levels

1. **Rules:** state + request → facts, one test per examples row.
2. **Seam:** a request in, component values out. A **load test** builds a level from each examples-table state and checks the world agrees with the rules.
3. **Simulation:** systems in isolation, plus long runs with property checks (4,000 ticks: every gap between actions, nothing fired mid-air).
4. **Whole game:** determinism (same seed twice; uneven frame times against a steady rate), a **transition test** (play a level, move on, compare with the next level built fresh: any difference is a leak), and a bot playthrough with frames.

Rules the compiler can't express (deadlines only through `after()`) get a source scan test; `@ts-expect-error` lines prove the types still reject what they should. A test must fail before the change; one that guards against future mistakes is checked by breaking the code on purpose once (copy the file aside first, and restore from the copy).

## Where this goes wrong

- **Describing behaviour from memory.** Before changing an effect, find what causes it and the test that pins it. No test? Write it first.
- **Brands survive parameters, not arithmetic**, and typed arrays strip them: re-brand a read value with the checking constructor, never a cast.
- **Relative rules need relative tests** (a share of max hp, not a fixed number), and a test counts only what it means (*my* bullet, not every bullet).
- **Layer commits may not each build** when a lower layer changes a signature: say so in the commit.
- **The bot is code too.** When a playtest goes badly, check the bot before tuning the game.

## Review checklist

- [ ] Prediction before, comparison after.
- [ ] New state passed "what reacts?", with a declared lifetime and units at its edges.
- [ ] Open design questions were asked, and the answers are in the examples table.
- [ ] Invariants listed, each with a test that failed first.
- [ ] Every request answered in every state; no field with two writers.
- [ ] One commit per layer; lint passes; playtested with frames.

## Not covered yet

- Language mapping: flat arrays, coroutines and exhaustive switches in Go, Java, Rust or C#.
- Networked play: rolling back the rules alongside the simulation.
- Saves as a feature: versioned formats and migrations.
