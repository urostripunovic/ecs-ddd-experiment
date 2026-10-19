# DDD + ECS Arena

A greybox three.js arena for testing a hybrid architecture: a hand-written ECS runs the 60 Hz simulation, and a thin, pure DDD layer owns the rules that change the game's state. This first slice has movement, shooting and one boss, The Warden, with two phases.

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests + zone boundary lint
npm run build      # production build in dist/
```

Add `?bossHp=200` to the URL for a short fight while tuning, and `?seed=7` for a different drop sequence.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | move |
| mouse | aim |
| left click / space | attack (shoot, swing, thrust or punch) |
| Q / right click | throw what you hold |
| E | swap with the weapon at your feet |
| R | reload |
| Enter | restart |
| <kbd>`</kbd> | dev tick log (command → event → component write) |

## The fight

- **Phase 1:** The Warden walks toward you and slams. The red ring shows where it will land, and the fill shows when. Kept at range, it alternates an aimed cone (the red wedge) with a jump onto you.
- **Phase 2** (at 50% hp, decided by the domain): radial bursts and cones between strafes, then a cone that rolls straight into a jump, then a faster slam.
- While it's in the air, nothing hits it. Hurt it fast enough and it jumps away, at most once every 8 seconds.
- Win when the boss goes down; lose when you do. The match outcome is domain state, reached through a process manager.

## Weapons

You start with a gun; a sword and a spear lie nearby, and a weapon or buff drops every 7 seconds. Walk over a weapon with empty hands to take it, or press E to swap.

| Weapon | Attack | Durability | Thrown |
| --- | --- | --- | --- |
| Gun | 16-round magazine, 25 per shot | never wears | 20, keeps its ammo |
| Sword | wide arc, 55 | wears per hit and over time | 60 |
| Spear | long, narrow thrust, 60 | wears per hit and over time | 95 |

A throw that hits sticks in the boss and falls out at its next slam or landing. A throw that misses can't be picked up for a second or more.

Haste (green) speeds you up and Fury (red) adds 50% damage, for 6 seconds each. The slam halves your speed for a second. All of it is ECS: nothing here is saved or rule-bound yet.

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
