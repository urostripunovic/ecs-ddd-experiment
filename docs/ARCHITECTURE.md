# Architecture

A hand-written ECS runs the real-time simulation; a thin, pure DDD layer owns the rules that change the game's state or mode; a bridge joins them through typed commands, events and projectors. The full reasoning is in the *Hybrid DDD + ECS Architecture for Games* doc. This page is the one-page version for this repo.

## Zones

| Zone | Owns | May import |
| --- | --- | --- |
| `src/domain/` | Rules and saved truth: boss phase and defeat, match outcome | nothing else in `src/` |
| `src/ecs/` | Simulation: movement, collision, shooting, boss choreography, game feel | nothing else in `src/` |
| `src/bridge/` | Outbox → commands, decide/evolve dispatch, projectors, id map, tick log, spawn projection | `domain/`, `ecs/` |
| `src/app/` | Fixed-timestep loop, three.js rendering, input, HUD | everything |

`npm run lint:deps` fails the build on any other import.

**One deviation from the doc:** the doc lists `outbox.ts` under `bridge/`. Here it lives in `ecs/core/outbox.ts`, because systems write to it and `ecs/` must not import `bridge/`. The bridge drains it.

## Tick order (60 Hz, fixed)

Written down in `src/app/loop.ts`:

1. `snapshotSystem`: copy position to previous position, for render interpolation
2. `inputSystem`: `PlayerInput` → player velocity, scaled by haste and slow
3. `bossPhaseSystem`: sample the damage the boss took this second, then start or step the coroutine for its current `BossPhase`
4. `movementSystem`
5. `bodyCollisionSystem`: circles against solids, clamp to the arena (an airborne boss is skipped)
6. `heldFollowSystem`: held items sit at their wielder
7. `stuckFollowSystem`: items lodged in the boss ride with it, and drop if it dies
8. `throwSystem`: a new throw press turns the held item `Flying`
9. `attackSystem`: gun shots, sword arcs, spear thrusts, fists; melee wear
10. `flightSystem`: a hit lodges the item `Stuck` in the target; a miss lands it `Grounded`, locked for 1–1.5 s
11. `pickupSystem`: empty hands pick up by walking over; `E` swaps; buffs apply on touch
12. `projectileCollisionSystem`: bullets stop on pillars and walls
13. `projectileSystem`: bullets damage the other team, and fly under anything airborne
14. `slamSystem`: a slam or jump landing hits at its stored centre when the telegraph runs out, slows whoever it hits, and knocks stuck items loose
15. `durabilitySystem`: held items decay over time; anything at 0 breaks
16. `stockSystem`: keeps one sword, spear and gun in play; a broken one returns 5 s later in a random clear spot
17. `hurtFlashSystem`
18. `dropSystem`: every 7 s, a seeded-random buff in a clear spot
19. `bossThresholdSystem`: hp crosses 50% → `BossThresholdCrossed` (latched by `PhasePending`)
20. `deathSystem`: hp ≤ 0 → `Dead` tag + `EntityDowned` (edge-triggered)
21. `domainStep`: drain outbox → command → `decide` → `evolve` → projector, plus process managers
22. render (once per frame, interpolated between the last two ticks)

## The chains in this slice

```
BossThresholdCrossed(warden) → BossPhaseReached(2) → BossPhase=2, PhasePending cleared
EntityDowned(boss)           → BossDefeated → (process manager) BossCleared → MatchWon → MatchView=Won
EntityDowned(player)         → PlayerDowned → MatchLost → MatchView=Lost
```

In `npm run dev`, press <kbd>`</kbd> in game to watch these in the tick log.

## Boss actions

Every boss attack (slam, cone, burst, jump) is an action, run one at a time through `begin()`/`finish()` in `ecs/systems/boss-actions.ts`, so two can never overlap. When the next action may start is the `CHAIN_GAPS` table, not waits inside the scripts:

| Phase | From → to | Gap (ticks) |
| --- | --- | --- |
| 1 | anything → anything | 10 |
| 2 | cone or burst → jump | 1 |
| 2 | everything else, including jump → any shot | 10 |

A jump is crouch, flight and a landing slam at a spot fixed at take-off. While airborne the boss can't be hit, by bullets, throws or blades. It jumps *away* when it loses more than 6% of its max hp in a second, at most once every 8 s. `boss-actions.test.ts` runs the choreography for thousands of ticks and checks every gap, that nothing fires mid-air, and that the phase 2 chain happens.

How each action looks is `app/render/boss-pose.ts`, a pure function of the action and how far into it the boss is.

## What stays out of the domain (on purpose)

ECS by default: a concept moves to `domain/` only when a rule, a save or another context reacts to it.

Hit points, bullets, slam timing and radius, ammo and reload, pillars, the boss's movement, the whole weapons slice (drops, pickup and swap, durability, throwing, stuck weapons, buffs, the slam slow) and the boss's actions, chain gaps, jumps and evading. They change every tick or only feed the simulation's own maths, so they are ECS. The phase is domain state (it would be saved), and the choreography inside it is an ECS coroutine that restarts from the top on load.
