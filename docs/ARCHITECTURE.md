# Architecture

A hand-written ECS runs the real-time simulation; a thin, pure DDD layer owns the rules that change the game's state or mode; a bridge joins them through typed commands, events and projectors. The full reasoning is in the *Hybrid DDD + ECS Architecture for Games* doc. This page is the one-page version for this repo.

## Zones

| Zone | Owns | May import |
| --- | --- | --- |
| `src/domain/` | Rules and saved truth: boss phase and defeat; the run (arena, cleared, won, lost, what carries over) | nothing else in `src/` |
| `src/ecs/` | Simulation: movement, collision, shooting, boss choreography, game feel | nothing else in `src/` |
| `src/bridge/` | Outbox → commands, decide/evolve dispatch, projectors, id map, tick log, spawn projection | `domain/`, `ecs/` |
| `src/app/` | Fixed-timestep loop, three.js rendering, input, HUD | everything |

`npm run lint:deps` fails the build on any other import.

**One deviation from the doc:** the doc lists `outbox.ts` under `bridge/`. Here it lives in `ecs/core/outbox.ts`, because systems write to it and `ecs/` must not import `bridge/`. The bridge drains it.

## Tick order (60 Hz, fixed)

Written down in `src/app/loop.ts`:

1. `snapshotSystem`: copy position to previous position, for render interpolation
2. `shakeSystem`: camera trauma decays (the wobble itself is drawn by the renderer)
3. `inputSystem`: a new dodge press starts a dash (unless cooling down or in a cutscene); a dash sets the velocity outright; otherwise `PlayerInput` → velocity, scaled by haste and slow, plus knockback; zero during a cutscene
4. `bossPhaseSystem`: sample the damage the boss took this second, then start or step the coroutine for its current `BossPhase`
5. `movementSystem`
6. `bodyCollisionSystem`: circles against solids, clamp to the arena or, while open, the tunnel (an airborne boss is skipped; a dodging player passes through the boss)
7. `heldFollowSystem`: held items sit at their wielder
8. `stuckFollowSystem`: items lodged in the boss ride with it, and drop if it dies
9. `throwSystem`: holding the throw fills the charge; a release throws the held item with damage and wear set by the gauge
10. `attackSystem`: gun shots, sword arcs, spear thrusts, fists; melee wear
11. `flightSystem`: a hit lodges the item `Stuck` in the target (wear scaled by the charge); a miss lands it `Grounded`, locked for 1–1.5 s
12. `pickupSystem`: empty hands pick up by walking over; `E` swaps; buffs apply on touch
13. `projectileCollisionSystem`: bullets stop on pillars and walls
14. `projectileSystem`: bullets damage the other team, and fly under anything airborne
15. `slamSystem`: a slam or jump landing hits at its stored centre when the telegraph runs out, slows whoever it hurts if the slam says so (only jump landings do), and knocks stuck items loose
16. `durabilitySystem`: held items decay over time; anything at 0 breaks
17. `stockSystem`: keeps one sword, spear and gun in play; a broken one returns 5 s later in a random clear spot
18. `hurtFlashSystem`
19. `dropSystem`: every 7 s, a seeded-random buff in a clear spot
20. `bossThresholdSystem`: hp crosses 50% → `BossThresholdCrossed` (latched by `PhasePending`)
21. `tunnelSystem`: the player past the end of an open tunnel → `TunnelEntered` (latched by `TunnelPending`)
22. `deathSystem`: hp ≤ 0 → `Dead` tag + `EntityDowned` (edge-triggered)
23. `domainStep`: drain outbox → command → `decide` → `evolve` → projector, plus follow-ups; then, if the run entered a new arena, rebuild the world from domain state
24. render (once per frame, interpolated between the last two ticks)

## The chains in this slice

```
BossThresholdCrossed(warden) → BossPhaseReached(2) → BossPhase=2, PhasePending cleared
EntityDowned(boss)           → BossDefeated → (follow-up) BossCleared → ArenaCleared → RunView=Cleared, tunnel open
TunnelEntered(player)        → ArenaEntered(2, loadout) → arena 2 built from the run's state (after the step)
TunnelEntered, not cleared   → TunnelRefused → latch released
EntityDowned(boss), arena 2  → BossDefeated → BossCleared → RunWon → RunView=Won
EntityDowned(player)         → PlayerDowned → RunLost → RunView=Lost
```

In `npm run dev`, press <kbd>`</kbd> in game to watch these in the tick log.

## Rules examples

Every request, in every state the rules can be in. Row numbers are permanent: tests and reviews refer to them.

| # | Area | State | Request | Facts | Test |
| --- | --- | --- | --- | --- | --- |
| R1 | run | new run | | Fighting, arena 1, carrying the gun | `run.test`: starts in arena 1 |
| R2 | run | Fighting, not the last arena | `BossCleared` | `ArenaCleared` | `run.test`: clearing a boss before the last arena |
| R3 | run | Cleared, not the last arena | `TunnelEntered(loadout)` | `ArenaEntered(next, loadout)` | `run.test`: entering the tunnel after a clear |
| R4 | run | Fighting | `TunnelEntered` | `TunnelRefused(NotCleared)` | `run.test`: refuses the tunnel |
| R5 | run | Fighting, the last arena | `BossCleared` | `RunWon` | `run.test`: clearing the last arena |
| R6 | run | Fighting | `PlayerDowned` | `RunLost` | `run.test`: going down loses |
| R7 | run | Lost (earlier the same tick) | `BossCleared` | none: the first outcome stands | `run.test`: a trade on the same tick |
| R8 | run | Cleared | `PlayerDowned` | `RunLost`. Unreachable in this game's current design, because nothing hurts you after a clear; answered so that the design can change | `run.test`: going down after the clear; `transition.test`: nothing hurts you once cleared |
| B1 | boss | phase 1 | `BossThresholdCrossed` | `BossPhaseReached(2)` | `boss.test`: enters phase 2 |
| B2 | boss | phase 2 | `BossThresholdCrossed` | none: already answered | `boss.test`: ignores a duplicate |
| B3 | boss | alive | `BossDowned` | `BossDefeated`, phase kept | `boss.test`: defeated once |
| B4 | boss | defeated | `BossThresholdCrossed` | none | `boss.test`: no phase change after defeat |

R8 was found by asking of each rule whether the simulation can make it wrong anyway: a bullet already in flight when the boss died could still down the player in a cleared arena, leaving the run neither lost nor going on. Two separate fixes: the rules now answer it (you lose), and, as a design choice for this game that may change, the simulation stops damage after a clear. Changing that choice is one line in `hurt()`.

## Boss actions

Every boss attack (slam, cone, burst, jump, and the roar that opens phase 2) is an action, run one at a time through `begin()`/`finish()` in `ecs/systems/boss-actions.ts`, so two can never overlap. When the next action may start is the `CHAIN_GAPS` table, not waits inside the scripts:

| Phase | From → to | Gap (ticks) |
| --- | --- | --- |
| 1 | anything → anything | 10 |
| 2 | cone or burst → jump | 1 |
| 2 | everything else, including jump → any shot | 10 |

The **roar** is a short cutscene: the boss rears up, then roars; the camera shakes, anyone within 7 m is shoved away, the player's controls are locked, and the boss takes no damage until it ends (hits still flash). The shake is drawn by the renderer and undone before mouse aim, so it never reaches the simulation.

A jump is crouch, flight and a landing slam at a spot fixed at take-off. While airborne the boss can't be hit, by bullets, throws or blades. It jumps *away* when it loses more than 6% of its max hp in a second, at most once every 8 s. `boss-actions.test.ts` runs the choreography for thousands of ticks and checks every gap, that nothing fires mid-air, and that the phase 2 chain happens.

How each action looks is `app/render/boss-pose.ts`, a pure function of the action and how far into it the boss is.

## The run, and what moved into the domain

The run is the first area that grew because of a feature. Which arena you're in, whether it's cleared, and what you carry between arenas are what a save would hold, so they're domain state. The *held weapon* is the first simulation concept promoted to the domain: it only gets a stable `WeaponId` when it crosses into the rules (`idMap.weaponIdOf`), the first time a rule (what carries over) reacts to it.

Entering an arena rebuilds the whole ECS world. That can't happen while the outbox is being drained, so the run projector records it and `domainStep` builds the arena once the step is finished. The tick keeps counting across arenas; the input counters carry over, and a new player starts caught up with them, so no press from arena 1 replays in arena 2.

## What lives how long

A new arena is built from domain state plus a short, declared list of values that live for the whole run. Everything else is wiped.

| Lives for | What | Declared in |
| --- | --- | --- |
| the arena | every per-entity component, `Cutscene`, `Shake`, `Stock`, boss coroutines, handle ↔ ID bindings | `ARENA_STATE` (`ecs/components`), `resetScripts`, `idMap.unbindHandles` |
| the run | domain state (run, bosses), the tick, entity generations, the RNG's position, the input counters, `RunView`, the weapon ID counter | `RUN_STATE` (`ecs/components`), `world`, `ecs/core/rng`, `bridge/id-map` |
| ever | tags, enums, the arena size | `CONSTANTS` (`ecs/components`) |
| presentation only | where the camera looks; it snaps when the player is a new entity | `app/render/camera.ts` |

**Saves.** There is no save feature: this demo is a boss rush that restarts from scratch. A save would be the run and boss states, plus the RNG's position if a loaded run must replay exactly. Where you restart from is a design choice made in one place: nothing (a boss rush), the run as it was on entering the arena (a checkpoint), or the current state (save anywhere). Building from any of them is already `buildArena`; `bridge/run/load.test.ts` builds a world from each state in the rules examples and checks it agrees with the rules, with the boss down in a cleared arena and the tunnel open.

Two tests hold this. `scope.test.ts` fails if a component or singleton is in no list, or in two. `app/transition.test.ts` plays arena 1 and walks into the tunnel, then builds arena 2 fresh from the same domain state and run values, and expects the same world. Handles are compared by slot, because generations are run-lifetime on purpose: they keep growing so stale handles stay stale.

## Units

Numbers that carry a unit are branded (`ecs/core/units.ts`): `Ticks` (a duration), `TickAt` (a moment), `Seconds` (dt-integrated countdowns), `Hp`, `Share` (0..1 of something) and `Meters`. Definitions tables, constructors and signatures use them (`waitTicks(Ticks)`, `startCutscene(Ticks)`, `spawnProjectile(…, dmg: Hp, life: Seconds, …)`, `dt: Seconds`); the per-tick loops read plain numbers from typed arrays. The constructors (`ticks`, `seconds`, `hp`, `share`, `meters`) reject impossible values when they're made, which for definitions is at module load.

Deadlines are made only with `after(duration)`, and seconds become ticks only through `inTicks`/`inSeconds`. `units.test.ts` scans the source for both, and holds `@ts-expect-error` lines that stop compiling if a brand ever stops working.

"Nothing spawns after the boss dies" needed no new rule: the stock and the buff drops already run only while fighting. The domain sets the mode (`Cleared`); the simulation reads it.

## What stays out of the domain (on purpose)

ECS by default: a concept moves to `domain/` only when a rule, a save or another context reacts to it.

Hit points, bullets, slam timing and radius, ammo and reload, pillars, the boss's movement, the whole weapons slice (drops, pickup and swap, durability, throwing, stuck weapons, buffs, the slam slow) and the boss's actions, chain gaps, jumps and evading. They change every tick or only feed the simulation's own maths, so they are ECS. The phase is domain state (it would be saved), and the choreography inside it is an ECS coroutine that restarts from the top on load.
