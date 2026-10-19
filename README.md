# DDD + ECS Arena

A greybox three.js arena for testing a hybrid architecture: a hand-written ECS runs the 60 Hz simulation, and a thin, pure DDD layer owns the rules that change the game's state. This first slice has movement, shooting and one boss, The Warden, with two phases.

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests + zone boundary lint
npm run build      # production build in dist/
```

Add `?bossHp=200` to the URL for a short fight while tuning.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | move |
| mouse | aim |
| left click / space | fire |
| R | reload |
| Enter | restart |
| <kbd>`</kbd> | dev tick log (command → event → component write) |

## The fight

- **Phase 1:** The Warden walks toward you and slams. The red ring shows where it will land, and the fill shows when.
- **Phase 2** (at 50% hp, decided by the domain): radial bullet bursts between strafes, then a faster slam.
- Win when the boss goes down; lose when you do. The match outcome is domain state, reached through a process manager.

## Layout

```text
src/
  domain/   pure rules: boss/ (phase, defeat), match/ (won, lost)
  ecs/      world, components (SoA), systems, prefabs, boss coroutines
  bridge/   commands, projectors, dispatch, id-map, spawn, tick-log
  app/      fixed-timestep loop, three.js scene, input, HUD
docs/       ARCHITECTURE.md (tick order), GLOSSARY.md
```

See `docs/ARCHITECTURE.md` for the zones, the tick order and the chains in this slice.
