# Architecture

A hand-written ECS runs the real-time simulation; a thin, pure DDD layer owns the rules that change the game's state or mode; a bridge joins them through typed commands, events and projectors. The full reasoning is in the *Hybrid DDD + ECS Architecture for Games* doc. This page is the one-page version for this repo.

## Zones

| Zone | Owns | May import |
| --- | --- | --- |
| `src/domain/` | Rules: a boss's defeat; the run (arena, cleared, won, lost, what carries over) | nothing else in `src/` |
| `src/ecs/` | Simulation: movement, collision, shooting, boss choreography, game feel | nothing else in `src/` |
| `src/bridge/` | Outbox → commands, decide/evolve dispatch, projectors, id map, tick log, spawn projection | `domain/`, `ecs/` |
| `src/app/` | Fixed-timestep loop, three.js rendering, input, HUD | everything |

`npm run lint:deps` fails the build on any other import.

**One deviation from the doc:** the doc lists `outbox.ts` under `bridge/`. Here it lives in `ecs/core/outbox.ts`, because systems write to it and `ecs/` must not import `bridge/`. The bridge drains it.

## Tick order (60 Hz, fixed)

Written down in `src/app/loop.ts`:

0. Dev builds only: `applyDevCommands` applies the god menu's queued cheats, recorded with this tick
1. `snapshotSystem`: copy position to previous position, for render interpolation
2. `shakeSystem`: camera trauma decays (the wobble itself is drawn by the renderer)
3. `inputSystem`: a new dodge press starts a dash (unless cooling down or in a cutscene); a dash sets the velocity outright; otherwise `PlayerInput` → velocity, scaled by haste and slow, plus knockback; zero during a cutscene
4. `bossPhaseSystem`: sample the damage the boss took this second, then start or step the coroutine for its current `BossPhase`
5. `movementSystem`
6. `orbitSystem`: orbiting pillars move along their circle, faster while spiked (frozen during a cutscene)
7. `bodyCollisionSystem`: circles against solids, clamp to the arena or, while open, the tunnel (an airborne boss is skipped; a dodging player passes through the boss)
8. `heldFollowSystem`: held items sit at their wielder
9. `stuckFollowSystem`: items lodged in the boss ride with it, and drop if it dies
10. `throwSystem`: holding the throw fills the charge; a release throws the held item with damage and wear set by the gauge
11. `attackSystem`: gun shots, sword arcs, spear thrusts, fists; melee wear
12. `flightSystem`: a hit lodges the item `Stuck` in the target (wear scaled by the charge); a miss lands it `Grounded`, locked for 1–1.5 s
13. `pickupSystem`: empty hands pick up by walking over; `E` swaps; buffs apply on touch
14. `projectileCollisionSystem`: bullets stop on pillars and walls
15. `projectileSystem`: bullets damage the other team, and fly under anything airborne
16. `slamSystem`: a slam or jump landing hits at its stored centre when the telegraph runs out, slows whoever it hurts if the slam says so (only jump landings do), and knocks stuck items loose
17. `spikeSystem`: a spiked pillar hurts and shoves a player touching it, once per touch (not through a dodge, not in a cutscene)
18. `durabilitySystem`: held items decay over time; anything at 0 breaks
19. `stockSystem`: keeps one sword, spear and gun in play; a broken one returns 5 s later in a random clear spot
20. `hurtFlashSystem`
21. `dropSystem`: every 7 s, a seeded-random buff in a clear spot
22. `bossThresholdSystem`: hp at or below 50% moves a phase-1 boss to phase 2 (the only writer of `BossPhase.phase`)
23. `spikeGrowthSystem`: orbiting pillars are spiked exactly while a live boss is in phase 2 and the run is fighting
24. `tunnelSystem`: the player past the end of an open tunnel → `TunnelEntered` (latched by `TunnelPending`)
25. `deathSystem`: hp ≤ 0 → `Dead` tag + `EntityDowned` (edge-triggered)
26. `domainStep`: drain outbox → command → `decide` → `evolve` → projector, plus follow-ups; then, if the run entered a new arena, rebuild the world from domain state
27. render (once per frame, interpolated between the last two ticks)

## The chains in this slice

```
EntityDowned(boss)           → BossDefeated → (follow-up) BossCleared → ArenaCleared → RunView=Cleared, tunnel open
TunnelEntered(player)        → ArenaEntered(2, loadout) → arena 2 built from the run's state (after the step)
TunnelEntered, not cleared   → TunnelRefused → latch released
EntityDowned(boss), arena 2  → BossDefeated → BossCleared → RunWon → RunView=Won
EntityDowned(player)         → PlayerDowned → RunLost → RunView=Lost
```

In `npm run dev`, press <kbd>`</kbd> in game to watch these in the tick log.

## Rules examples

Every request, in every state the rules can be in. Row numbers are permanent: tests and reviews refer to them. Status says how settled a row is: accepted (decided, pinned by its test), experimental (a guess to try in play, safe to change) or open (waiting for a decision). `src/docs.test.ts` checks that every row has a status, that an accepted row names a test, and that the tests it names exist.

| # | Area | State | Request | Facts | Status | Test |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | run | new run |  | Fighting, arena 1, carrying the gun | accepted | `run.test`: starts in arena 1 |
| R2 | run | Fighting, not the last arena | `BossCleared` | `ArenaCleared` | accepted | `run.test`: clearing a boss before the last arena |
| R3 | run | Cleared, not the last arena | `TunnelEntered(loadout)` | `ArenaEntered(next, loadout)` | accepted | `run.test`: entering the tunnel after a clear |
| R4 | run | Fighting | `TunnelEntered` | `TunnelRefused(NotCleared)` | accepted | `run.test`: refuses the tunnel |
| R5 | run | Fighting, the last arena | `BossCleared` | `RunWon` | accepted | `run.test`: clearing the last arena |
| R6 | run | Fighting | `PlayerDowned` | `RunLost` | accepted | `run.test`: going down loses |
| R7 | run | Lost (earlier the same tick) | `BossCleared` | none: the first outcome stands | accepted | `run.test`: a trade on the same tick |
| R8 | run | Cleared | `PlayerDowned` | `RunLost`. Unreachable in this game's current design, because nothing hurts you after a clear; answered so that the design can change | accepted | `run.test`: going down after the clear; `transition.test`: nothing hurts you once the arena is cleared |
| R9 | run | Won, this tick | `PlayerDowned` | `RunLost`: if we die, we die. A trade loses whichever death was reported first | accepted | `run.test`: a trade with the last boss; `flow.test`: a trade with the last boss loses the run |
| R10 | run | Cleared, not the last arena | `TunnelEntered(loadout with perks)` | `ArenaEntered(next, loadout)`: perks carry over, oldest first. A loadout holds at most three, never the same one twice (`loadoutOf` throws otherwise) | accepted | `run.test`: carry over with the loadout, oldest first; `run.test`: are never more than three, and never the same one twice |
| B1 | boss | (removed: the phase moved to the simulation) |  |  |  |  |
| B2 | boss | (removed) |  |  |  |  |
| B3 | boss | alive | `BossDowned` | `BossDefeated` | accepted | `boss.test`: defeated once |
| B3b | boss | defeated | `BossDowned` | none: already answered | accepted | `boss.test`: defeated once |
| B4 | boss | (removed) |  |  |  |  |

R8 was found by asking of each rule whether the simulation can make it wrong anyway: a bullet already in flight when the boss died could still down the player in a cleared arena, leaving the run neither lost nor going on. Two separate fixes: the rules now answer it (you lose), and, as a design choice for this game that may change, the simulation stops damage after a clear. Changing that choice is one line in `hurt()`.

## Boss actions

Every boss attack (slam, cone, burst, jump, the roar that opens phase 2, and the Unchained's ring and spiral) is an action, run one at a time through `begin()`/`finish()` in `ecs/systems/boss-actions.ts`, so two can never overlap. When the next action may start is the `CHAIN_GAPS` table, one per boss style, not waits inside the scripts:

| Boss | Phase | From → to | Gap (ticks) |
| --- | --- | --- | --- |
| Warden | 1 | anything → anything | 10 |
| Warden | 2 | cone or burst → jump | 1 |
| Warden | 2 | everything else, including jump → any shot | 10 |
| Unchained | 1 | ring → jump | 1 |
| Unchained | 2 | cone, ring or spiral → jump | 1 |
| Unchained | 1, 2 | everything else | 6 |

The **roar** is a short cutscene: the boss rears up, then roars; the camera shakes, anyone within 7 m is shoved away, the player's controls are locked, and the boss takes no damage until it ends (hits still flash). The shake is drawn by the renderer and undone before mouse aim, so it never reaches the simulation.

A jump is crouch, flight and a landing slam at a spot fixed at take-off. While airborne the boss can't be hit, by bullets, throws or blades. It jumps *away* when it loses more than 6% of its max hp in a second, at most once every 8 s. `boss-actions.test.ts` runs the choreography for thousands of ticks and checks every gap, that nothing fires mid-air, and that the phase 2 chain happens.

**The gap ring** (the Unchained): a ring of bullets with three gaps, shown on the floor before each wave (`Pattern.gapAt`, the same number the bullets are fired from). Each wave turns the gaps by less than the overlap every wave still in the air needs, so there's always one spot safe from all of them and you survive by drifting with it. `patterns.test.ts` holds that, from the bullet speed and wave gap, and walks a player through three waves at walking speed. **The spiral**: three arms turning slowly; walk with a lane or dodge through an arm.

**The Grinder** (arena 2): one fixed perch and four pillars orbiting the middle. In phase 2 they grow spikes, speed up, and hurt on touch. The spikes are derived from the boss's phase every tick, not set by the roar, so a world built straight into phase 2 has them. Pillars and spikes hold still during cutscenes, so nothing hits you while your controls are locked.

How each action looks is `app/render/boss-pose.ts`, a pure function of the action and how far into it the boss is.

## The run, and what moved into the domain

The run is the first area that grew because of a feature. Which arena you're in, whether it's cleared, and what you carry between arenas have rules other parts depend on (entering the tunnel can be refused, the loadout carries over, the run is won or lost), so they're domain state. That a save would hold them is a hint about their lifetime, not the reason. The *held weapon* is the first simulation concept promoted to the domain: it only gets a stable `WeaponId` when it crosses into the rules (`idMap.weaponIdOf`), the first time a rule (what carries over) reacts to it.

Entering an arena rebuilds the whole ECS world. That can't happen while the outbox is being drained, so the run projector records it and `domainStep` builds the arena once the step is finished. The tick keeps counting across arenas; the input counters carry over, and a new player starts caught up with them, so no press from arena 1 replays in arena 2.

## What lives how long

A new arena is built from domain state plus a short, declared list of values that live for the whole run. Everything else is wiped.

| Lives for | What | Declared in |
| --- | --- | --- |
| the arena | every per-entity component, `Cutscene`, `Shake`, `Stock`, boss coroutines, handle ↔ ID bindings | `ARENA_STATE` (`ecs/components`), `resetScripts`, `idMap.unbindHandles` |
| the run | domain state (run, bosses), the tick, entity generations, the RNG's position, the input counters, `RunView`, the weapon ID counter | `RUN_STATE` (`ecs/components`), `world`, `ecs/core/rng`, `bridge/id-map` |
| ever | tags, enums, the arena size | `CONSTANTS` (`ecs/components`) |
| presentation only | where the camera looks; it snaps when the player is a new entity | `app/render/camera.ts` |

**Saves.** There is no save feature: this demo is a boss rush that restarts from scratch. A save would hold the run and boss states, plus the RNG's position if a loaded run must replay exactly. Simulation state serializes just as well (it's plain arrays), so a save mid-fight could keep the boss's phase too, without the phase becoming a rule. Where you restart from is a design choice made in one place: nothing (a boss rush), the run as it was on entering the arena (a checkpoint), or the current state (save anywhere). Building from any of them is already `buildArena`; `bridge/run/load.test.ts` builds a world from each state in the rules examples and checks it agrees with the rules, with the boss down in a cleared arena and the tunnel open.

Two tests hold this. `scope.test.ts` fails if a component or singleton is in no list, or in two. `app/transition.test.ts` plays arena 1 and walks into the tunnel, then builds arena 2 fresh from the same domain state and run values, and expects the same world. Handles are compared by slot, because generations are run-lifetime on purpose: they keep growing so stale handles stay stale.

## Units

Numbers that carry a unit are branded (`ecs/core/units.ts`): `Ticks` (a duration), `TickAt` (a moment), `Seconds` (dt-integrated countdowns), `Hp`, `Share` (0..1 of something) and `Meters`. Definitions tables, constructors and function signatures use them (`waitTicks(Ticks)`, `startCutscene(Ticks)`, `spawnProjectile(…, dmg: Hp, life: Seconds, …)`, `dt: Seconds`); the per-tick loops read plain numbers from typed arrays. The constructors (`ticks`, `seconds`, `hp`, `share`, `meters`) reject impossible values when they're made, which for definitions is at module load.

Deadlines are made only with `after(duration)`, and seconds become ticks only through `inTicks`/`inSeconds`. `units.test.ts` scans the source for both, and holds `@ts-expect-error` lines that stop compiling if a brand ever stops working.

"Nothing spawns after the boss dies" needed no new rule: the stock and the buff drops already run only while fighting. The domain sets the mode (`Cleared`); the simulation reads it.

## Dev tools: the god menu

<kbd>G</kbd> in `npm run dev` opens it. Every cheat is a `DevCommand`, one typed list shared by the menu, the playtest recorder and tests, applied at the start of a tick and recorded with it, so a replay with the same seed, inputs and cheats is the same run. Any cheat sets `GodMode.cheated`, shown as "CHEATS USED" until a restart.

| Level | Cheats | How |
| --- | --- | --- |
| Debug: forces simulation data | invulnerable, weapons never run dry or wear, freeze boss, give a weapon, heal, the inspector's field edits | `GodMode` flags read by the systems, or a direct write; the rules' sensors still watch the result |
| Gameplay: through the rules | damage or kill the boss, jump to arena 1, arena 1 cleared, arena 2, arena 2 in phase 2, won | The boss's hp changes and the threshold and death sensors run the normal chain; a jump builds a rules state and loads it with `loadRunState`, then checks `disagreements` |

A cheat never injects a fact into the rules and never writes `RunView`: the world and the rules would disagree. The inspector is generated from `ARENA_STATE`, so a new component appears without touching the menu. Time controls (pause, step one tick, quarter speed) live in the frame driver (`timeControl`) and never change what a tick does. None of it ships: the menu loads only in dev, the systems' god-mode checks compile away in release, and `app/dev/release.test.ts` builds the release bundle and looks for cheat code.

## What stays out of the domain (on purpose)

ECS by default: a concept moves to `domain/` only when something outside the simulation depends on its rules: another area, or a decision a save must not get wrong.

Hit points, bullets, slam timing and radius, moving pillars and their spikes, the ring's gaps, ammo and reload, pillars, the boss's movement, the whole weapons slice (drops, pickup and swap, durability, throwing, stuck weapons, buffs, the slam slow) and the boss's actions, chain gaps, jumps and evading. They change every tick or only feed the simulation's own maths, so they are ECS.

**The boss's phase moved out of the domain.** It started there because the source doc used it as the example, and it never passed the "what reacts?" test: every reader is simulation or display (the choreography, the boss's colour, the HUD), and the rule ("phase 2 at half hp, once") always said yes. The domain keeps the boss's lifecycle, alive then defeated, because the run reacts to the defeat. If a checkpoint mid-fight or a story beat ever reacts to phase 2, it comes back.
