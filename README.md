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
| Shift | dodge: a short dash, invulnerable while it lasts, through the boss but not pillars |
| Q / right click (hold, release) | charge and throw what you hold |
| E | swap with the weapon at your feet |
| R | reload |
| Enter | restart |
| <kbd>`</kbd> | dev tick log (command → event → component write) |

## The fight

- **Phase 1:** The Warden walks toward you and slams. The red ring shows where it will land, and the fill shows when. Kept at range, it alternates an aimed cone (the red wedge) with a jump onto you.
- **Phase 2** (at 50% hp, decided by the domain) opens with a roar: the screen shakes, you're shoved back if close, and you can't act until it ends. Then radial bursts and cones between strafes, then a cone that rolls straight into a jump, then a faster slam.
- While it's in the air, nothing hits it. Hurt it fast enough and it jumps away, at most once every 8 seconds.
- Its jump landing slows you for a second; its stamp hits harder but doesn't slow. Dodge (Shift) through either: for the 0.2 s of the dash nothing hurts you, and you can roll through the Warden itself. 0.75 s cooldown.
- A run is two arenas. Beat the Warden and the arena is cleared: nothing new spawns, nothing can hurt you any more, the gate in the north wall sinks, and a dark tunnel opens. Walk into it and you come out in arena 2, with the hp and the weapon you had. There the Warden waits on a pillar and drops in.
- Win by clearing arena 2; lose if you go down in either. The run (which arena, cleared or not, what you carried) is domain state.

## Weapons

The arena always holds one gun, one sword and one spear. You start with the gun; the others lie nearby. A blade that breaks comes back 5 seconds later somewhere random, and until you pick something up you fight with your fists (8 damage, short reach). A buff drops every 7 seconds. Walk over a weapon with empty hands to take it, or press E to swap.

| Weapon | Attack | Durability | Thrown |
| --- | --- | --- | --- |
| Gun | 16-round magazine, 25 per shot | never wears | 20, keeps its ammo |
| Sword | wide arc, 55 | wears per hit and over time | 60 |
| Spear | long, narrow thrust, 60 | wears per hit and over time | 95 |

**Charged throws:** hold Q or right click and a gauge fills over a second. Release in the gold perfect zone for 125% damage and half the usual wear; hold past it for the same damage but double wear; tap for a weak, quick throw (40%). A throw that hits sticks in the boss and falls out at its next slam or landing. A throw that misses can't be picked up for a second or more.

Haste (green) speeds you up and Fury (red) adds 50% damage, for 6 seconds each. A jump landing halves your speed for a second. All of it is ECS: nothing here is saved or rule-bound yet.

## Layout

```text
src/
  domain/   pure rules: boss/ (phase, defeat), run/ (arena, cleared, won, lost, what carries over)
  ecs/      world, components (SoA), systems, prefabs, boss coroutines
  bridge/   commands, projectors, dispatch, id-map, spawn, tick-log
  app/      fixed-timestep loop, three.js scene, input, HUD
docs/       ARCHITECTURE.md (tick order), GLOSSARY.md
```

See `docs/ARCHITECTURE.md` for the zones, the tick order and the chains in this slice.
