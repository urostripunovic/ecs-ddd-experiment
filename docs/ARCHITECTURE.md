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
2. `inputSystem`: `PlayerInput` → player velocity
3. `bossPhaseSystem`: start or step the coroutine for the boss's current `BossPhase`
4. `movementSystem`
5. `bodyCollisionSystem`: circles against solids, clamp to the arena
6. `fireSystem`: player weapon, magazine and reload; spawns bullets
7. `projectileCollisionSystem`: bullets stop on pillars and walls
8. `projectileSystem`: bullets damage the other team
9. `slamSystem`: a slam lands when its telegraph runs out
10. `hurtFlashSystem`
11. `bossThresholdSystem`: hp crosses 50% → `BossThresholdCrossed` (latched by `PhasePending`)
12. `deathSystem`: hp ≤ 0 → `Dead` tag + `EntityDowned` (edge-triggered)
13. `domainStep`: drain outbox → command → `decide` → `evolve` → projector, plus process managers
14. render (once per frame, interpolated between the last two ticks)

## The chains in this slice

```
BossThresholdCrossed(warden) → BossPhaseReached(2) → BossPhase=2, PhasePending cleared
EntityDowned(boss)           → BossDefeated → (process manager) BossCleared → MatchWon → MatchView=Won
EntityDowned(player)         → PlayerDowned → MatchLost → MatchView=Lost
```

In `npm run dev`, press <kbd>`</kbd> in game to watch these in the tick log.

## What stays out of the domain (on purpose)

Hit points, bullets, slam timing and radius, ammo and reload, pillars, the boss's movement. They change every tick or only feed the simulation's own maths, so they are ECS. The phase is domain state (it would be saved), and the choreography inside it is an ECS coroutine that restarts from the top on load.
