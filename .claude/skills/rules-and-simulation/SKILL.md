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
4. **Proper TDD, one behaviour at a time** (the loop is in `game-implementation`). Keep each new test's failing line for the report in step 8: a test you can't show red wasn't written first, and the person reviewing should be able to see that without reading code.
5. **Commits are self-contained** (`self-contained-commits`): every commit does one thing and passes on its own, with fixes folded into the commits that caused them. Commit after the tidy step (7).
6. **Playtest.** A bot plays the real game with nobody at the keyboard, and saves frames to look at. Long runs can skip rendering; frames need it. Feel, "it works but it's wrong", and bugs in anything that only runs in the real loop (menus, dev tools, input timing) only show up here: a unit test never runs them there.
7. **Tidy, as its own step.** Steps 4–6 are allowed to be fast and a little ugly: that's how the shape is found, and pressure is fine there. Before committing, stop and re-read your own diff as a reviewer would, with `game-implementation`'s tidy questions, and make it clean while it's still small. The tests and the structure checks pass before and after, unchanged: a tidy pass changes shape, never behaviour. A few minutes a stage is cheap; the same cleanup after five features is a session, and by then it's late.
8. **Compare** the prediction with what changed, and explain each miss. Show each new test's failing line from step 4, and how much each file you touched grew (a stage report script prints it, with which files keep changing across recent commits). Then say what was harder than it should have been and why (the architecture, the tooling, or this skill), and any choice you made that nobody asked for. A file outgrowing its one job is friction too: say so, and split it before building on it. Friction is how you learn whether the structure helps or costs; left unsaid, no retro can find it.

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
- **Requests and facts are named apart** [commands, events]: `DoorEntered` asks; `LevelEntered`, past tense, is decided.
- **Every request is answered in every state the rules can be in.** A refusal is a fact (`DoorRefused`). "No facts" means "already answered", so a repeated request is harmless. Whether a request *can* arrive in a state is the simulation's design choice; the rules answer it anyway, so that choice can change without a softlock.
- **One area reacts to another through a follow-up** [process manager]: `BossDefeated` becomes a request to the run, never one area reaching into another.
- **Time arrives as a request; the tick is the only clock.**
- **Things the rules keep get stable IDs.** Entity handles never enter the rules; something born in the simulation gets its ID when it first crosses.
- **Every switch ends in an exhaustiveness check**, so a new kind breaks the build where it must be handled.
- **A short, numbered examples table per area**: state, request, facts, status, the test that pins it. Status is accepted (decided and tested), experimental (a guess to try in play) or open (waiting for a decision), so the next agent can tell an intended rule from code that merely happens to behave that way. Rows are never renumbered; removed rows leave gaps. Decisions from the interview land here.
- **States with different invariants are different types** (only a finished run has an end tick). Numbers from the simulation are checked once, by a constructor where they enter the rules, never field by field inside them.

## The simulation

- **Flat arrays per field; per-kind numbers in definitions tables.** Numbers that appear together become a named definition (`attack(enemy, HEAVY_SWING)`, never `attack(enemy, 42, 4.5, 30)`).
- **Every system starts with `reads … | writes … | emits …`**, and the tick order is written in one place. Emits names the outbox slots it fills, so which systems can wake the rules (and through them rebuild a level) is readable without tracing.
- **Each field of an entity has one writer, at a known point in the tick.** Where several sources must combine on one entity (damage, a shove, a stun), they send requests that one system applies with an explicit policy. `game-implementation` has the cases that are fine, why engines work this way, and the check that lists every shared field.
- **Behaviour comes from components.** What an entity does is which components it has, and systems run on whatever has theirs. Per-kind definitions hold numbers, not switches.
- **Inputs that must not be lost or doubled are counters**; sensors fire on the edge and latch until answered.
- **Durations are deadlines** made with one helper (`after(ticks)`), never countdowns.
- **A value that breaks a boundary check fails loudly in development and tests, and is logged, clamped and survived in a release build.** A player never loses a run to a bug report. How each language does it belongs with the implementation.
- **Every piece of state declares its lifetime**: the level, the run, or forever. A new level wipes level state from that list, and a test fails if something is in no list.
- **Units are types at the edges**: durations, moments, seconds, hit points, shares, distances, in definitions and signatures. The hot loops read plain numbers. A brand is a value object without the object. Constructors reject impossible values when they're made.
- **Lifecycles are exclusive states with one function per transition** (`drop()` is the only way onto the ground).
- **Actions run one at a time; the gaps between them are a table.**
- **Coroutines are for choreography that is never saved.**
- **Store handles, never slots; name things by stable ID in logs and tests.**
- **Randomness is seeded**, so a seed and inputs replay a run. **One stream per job, passed in**: each system that draws gets its own seeded generator as a parameter. With one shared generator, a single new draw anywhere shifts every later draw everywhere, and a seed quietly becomes a different run.
- **Presentation is derived and never feeds back.** Undo a camera shake before aiming through the camera.
- **Measure before optimizing the storage.** Flat arrays and preallocated query buffers are the default; archetypes, schedulers and parallel systems wait for a profile of the real workload that asks for them.

## The seam

- **The outbox lives on the simulation side**; the seam drains it.
- **A tick is the unit of change.** The rules run once per tick, synchronously, before rendering; every fact of a decision applies in that step, and observers (renderer, save, network) only look between ticks. The tick never waits on anything: predict and correct, or show a waiting mode.
- **Projections are read-only to everyone but the seam**, like a read-only replica: the projection is exported read-only, its writable side from one module only the seam may import, enforced by the boundary lint. Without read-only types, a source scan test is the fallback.
- **A level is built from rules state by one function** [spawn projection], for the first level, every level after it, and any load. It builds from **every** rules state, not only the ones play reaches: a level loaded after its boss died has the boss down and the exit open. Rebuilding waits until the rules step ends. Simulation state that honestly lives for the whole run (the tick, the RNG's position, input counters, handle generations) is listed, not hidden.
- **The seam maps; it never decides.** It turns names into numbers and facts into component writes. A branch in the seam that picks an outcome is a rule that hasn't found its area: move it into the rules, as a fact. The seam for an area should stay smaller than both sides it joins; when it isn't, say so in the report. Signs it's thickening: a projector computing something no fact says, a conditional on rules state other than a mode, the same check in the seam and the rules, a name turned into a number (or back) anywhere but its vocabulary's table.
- **Names cross through one table per vocabulary.** The rules' word for a thing (a weapon kind, a perk, a door) and the simulation's number for it are two vocabularies, and the boundary lint guarantees they're written twice: the rules may not import the simulation, not even its types. So translate in the seam, through one declared table per vocabulary, rules' name → number, which the compiler can check is complete. The way back is derived from that table, never a second hand-written list and never a conditional (`n === Final ? 'final' : 'onward'`): either one drifts silently when the simulation gains a member. A number with no name is a bug on the simulation's side, so the lookup throws instead of standing in for something else. A test per vocabulary fails when the simulation has a member the rules can't name, because that's the one direction no compiler sees.
- **Projectors write components and never send requests.** A new request comes from the simulation on the next tick, so a loop is bounded by the tick. Follow-ups run with a fixed maximum depth that fails loudly when passed.
- **A value both sides hold has one live owner at a time.** A carried item's wear is the simulation's while the level runs; at the crossing a fact records it (the clear carries the loadout), and the spawn projection hands it back. Never both live, never synced field by field mid-level. One state check lists every value both sides hold and says where the world and the rules disagree; the load test and the dev tools call it, and a new crossing value is added to it in the same commit.
- **Identity mapping lives only here.** A dev-only log records each chain: request → fact → what was written, so one player action can be followed without opening every file it passes.
- **Boundaries are enforced by a lint**, not by review.
- **Cheats and dev tools are requests or loads, never facts or projection writes.** Forcing simulation data is fine (the rules' sensors still watch it); reaching a rules state goes through the load path. Cheats are recorded as inputs, mark the run, and never ship (a test builds the release bundle and looks).

A save holds the rules state, the RNG's position if loads must replay exactly, and any simulation state the design keeps. Loading is the spawn projection, never a second path.

## Tests, in four levels

1. **Rules:** state + request → facts, one test per examples row.
2. **Seam:** a request in, component values out. A **load test** builds a level from each examples-table state and checks the world agrees with the rules.
3. **Simulation:** systems in isolation, plus long runs with property checks (4,000 ticks: every gap between actions, nothing fired mid-air).
4. **Whole game:** determinism (same seed twice; uneven frame times against a steady rate), a **transition test** (play a level, move on, compare with the next level built fresh: any difference is a leak), and a bot playthrough with frames.

The docs are part of the contract, so a **drift test** checks them against the code: every code name the architecture doc and glossary mention exists, every examples row has a status, and the tests the rows name exist. It can't prove the meaning matches; it makes the common drift loud. Rules the compiler can't express (deadlines only through `after()`) get a source scan test; `@ts-expect-error` lines prove the types still reject what they should. A test must fail before the change; one that guards against future mistakes is checked by breaking the code on purpose once (copy the file aside first, and restore from the copy). A test you've never seen fail may be blind, and a blind test looks exactly like a passing one. The two checks cover each other: the playtest finds what no test runs, breaking the code finds tests that can't fail.

## Where this goes wrong

- **Describing behaviour from memory.** Before changing an effect, find what causes it and the test that pins it. No test? Write it first.
- **Relative rules need relative tests** (a share of max hp, not a fixed number), and a test counts only what it means (*my* bullet, not every bullet).
- **The bot is code too.** When a playtest goes badly, check the bot before tuning the game.
- **A dev tool that throws can stop the game loop.** Guard it so a bug in the tool can't freeze the game it inspects.

## Review

Reviewing a change belongs to the reviewer, who has the diff and room to spare: `review.md` next to this skill is what to look for. A game points its reviewer there from `CODING_STANDARDS.md`. While building, the tidy step (7) is your own review.

## Not covered yet

- Language mapping: flat arrays, coroutines and exhaustive switches in Go, Java, Rust or C#.
- Networked play: rolling back the rules alongside the simulation.
- Saves as a feature: versioned formats and migrations.
