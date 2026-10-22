# DDD + ECS Arena

A greybox three.js boss rush built to test a hybrid architecture: a hand-written ECS runs the 60 Hz simulation, a thin, pure DDD layer owns the rules that change the game's state, and a bridge joins them. It was built by a designer and an agent together, as the test bed for the game skills in `.claude/skills/`; [docs/LEARNING.md](docs/LEARNING.md) is the tour for anyone, agent or human, learning from it.

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck, tests (structure checks included), zone boundary lint
npm run build      # production build in dist/
```

Add `?seed=7` to the URL to replay a run exactly, and `?bossHp=200` for a short fight while tuning.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | move |
| mouse | aim |
| left click / space | attack: shoot, swing, thrust, spray or punch; the railgun charges while held and fires on release |
| Shift | dodge: a short dash, invulnerable while it lasts, through the boss but not pillars |
| Q / right click (hold, release) | charge and throw what you hold; the warhammer spins while held |
| E | swap with the weapon at your feet |
| R | reload |
| Enter | restart |
| <kbd>`</kbd> | dev tick log (command → event → component write) |
| <kbd>G</kbd> | god menu, dev builds only: invulnerable, give weapons, kill the boss, jump to any arena state, pause and step, an entity inspector |

## The game

- **A run:** the Warden first (the tutorial), then bosses drawn from a pool, until a clear opens a red door to the final boss, the Keeper. How strong you are decides when that door opens; it's never shown.
- **Bosses:** the hand-made Warden, Unchained and Keeper, and procedural bosses (a Colossus, a Lancer, a Sentinel) whose moves are generated from the run's seed and checked for fairness across hundreds of seeds.
- **Weapons:** a sword, a spear and a gun in every arena; from the second arena, one special (chakram, warhammer, railgun or flamethrower). Weapons found deeper have a higher level and hit harder. Throws are charged on a gauge; the warhammer spins instead.
- **Between fights:** pick one of three rewards (a revive, an armor plate, a heal, the Scattergun), and carry up to three perks.

How each of these works, and what was decided with the designer, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Layout

```text
src/
  domain/      pure rules: boss/ (defeat), run/ (arena, cleared, won, lost, doors, rewards, what carries over)
  ecs/         world, components (SoA), systems, the tick order, bosses (hand-made and generated), weapons
  bridge/      commands, projectors, dispatch, id-map, spawn projection, tick log
  app/         fixed-timestep loop, three.js scene, input, HUD, dev god menu
  structure.test.ts   the checks that keep the code clean
docs/          ARCHITECTURE.md, GLOSSARY.md, LEARNING.md
tools/         playtest bot and recorder, mutation runner
SKILL-NOTES.md where the skills fell short, and what changed
```
