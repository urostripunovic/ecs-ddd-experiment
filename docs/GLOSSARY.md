# Glossary

The same idea can live at both levels under different names. Keep them apart.

| Term | Level | Meaning |
| --- | --- | --- |
| **Phase** | ECS (`BossPhase.phase`) | Which stage of the fight the boss is in (1 or 2). Written only by `bossThresholdSystem`: phase 2 at half hp, once. Not a rule, because nothing outside the fight reacts to it. |
| `BossPhase.running` | ECS component | Which phase's coroutine the ECS has started, so a new phase starts its choreography from the top. |
| **Defeated** | domain (`domain/boss`) | The boss's lifecycle: alive, then defeated, once. The run reacts to it. |
| **Unchained** | ECS (`BossStyle`) | Arena 2's boss: the Warden's body with shorter chain gaps, the gap ring and the spiral. `BossDef.style` picks its scripts. |
| **Gap ring** | ECS (`Pattern`) | A ring of bullets with three telegraphed gaps that turn a little each wave. |
| **Orbiting pillar** | ECS (`Orbit`, `Orbiting`) | A pillar on a circle around the arena's middle; still blocks bodies and shots. |
| **Spiked** | ECS tag | An orbiting pillar while a live boss is in phase 2: faster, and hurts on touch, once per `SPIKE_COOLDOWN`. |
| **Perk** | ECS (`Perks`), carried by the domain | One of three slots on the player, oldest first. Its effect is simulation; the run's loadout carries which ones you hold (`PerkName`). |
| **Revive** | domain (`RunState.revives`) | A spare life: going down with one left gets you back up instead of losing. Start 3, max 8. |
| **Reward** | domain (`Reward`), pedestals in the ECS | What a cleared boss offers: three to pick one from. `revive`, `armor`, `heal` or `scattergun`. |
| **Armor plate** | ECS (`Armor`), carried by the loadout | Blocks one hit completely, then breaks. At most three. |
| **Pool** | ECS (`POOL`) | The boss-and-arena pairs a run draws its middle arenas from. |
| **Depth** | ECS (`arenaFor`) | How far into the run an arena is (arena 1 is depth 0). Each step adds hp and pace to its boss. |
| **Procedural boss** | ECS (`BossGen`, `planFor`) | A drawn boss generated from a kit (a seed), its depth and its body: its name, phases and each phase's moves. |
| **Body** | ECS (`Body`) | What a procedural boss is: the Colossus, the Lancer or the Sentinel. It weights which moves a kit draws, gives one signature move, and decides what the boss does between moves. |
| **Kit** | ECS (`BossGen.kit`) | The seed a procedural boss's moves come from: the run's seed and the arena (`kitFor`). |
| **Charge** | ECS action | The Lancer's: a lane shown on the floor, then a straight run down it. A pillar in the way stuns it. |
| **Sweep** | ECS action | The Sentinel's: an arc shown on the floor, then a beam turning across it once. Pillars block it. |
| **Orb** | ECS (`Homing`) | A slow projectile that turns after the player, slower than walking. |
| **Combo** | ECS action | A generated storm: spiral arms and gap rings as one action, in a procedural boss's last phase. |
| **Keeper** | ECS (`FINAL`) | The final boss: three phases, the Warden's moves, then rings and the spiral, then the storm. |
| **Storm** | ECS action | The Keeper's phase 3 attack: two spiral arms and gap rings at once, as one action. |
| **Slam** | ECS | A telegraphed area attack: windup ticks, radius, damage. Pure simulation. |
| **Run** | domain (`domain/run`) | A sequence of arenas: which one you're in, whether it's `Fighting`, `Cleared`, `Won` or `Lost`, and the loadout it was entered with. |
| **Loadout** | domain | What passes between arenas: hp and the held weapon (kind, wear, ammo, level, and its `WeaponId`). The run starts you with a level-1 gun. |
| **Special** | ECS (`Stock.special`) | The one special weapon an arena keeps stocked on top of the basics, drawn from the seed: chakram, warhammer, railgun or flamethrower. None in the tutorial. |
| **Spin** | ECS | A warhammer held on throw: hits all round you, building momentum that the release turns into a harder, longer throw. |
| **Dizzy** | ECS (`Dizzy`) | After a hammer breaks mid-spin: for 2 s your feet wander in a randomly turning direction, added to what you press. |
| **Bloom** | ECS (`railBloom`) | How far off your aim an overcharged railgun shot may go: none in the perfect zone, wider the further past it. |
| **Burn** | ECS (`Burn`) | Damage over time from the flamethrower: hit points a second until a tick deadline, through `hurt`. |
| **Tracer** | ECS (`Tracer`) | A railgun beam drawn for a moment; it hurts nothing itself. |
| **Weapon level** | ECS (`Item.level`), carried by the domain | The arena a weapon turned up in. Each level past the first adds 15% to every hit it deals; the run weighs it in power. Shown on the HUD. |
| `RunView` | ECS singleton | Projected copy of the run (status, arena, whether it's the final, which doors are open) that systems and the HUD read. Typed read-only; only `bridge/` can import its writable side (`RunViewWritable`), so only the run projector and the spawn projection write it. |
| **Command** | bridge | Something the simulation asks the domain, e.g. `BossDowned`. Imperative or attempt. |
| **Domain event** | domain | A fact the domain decided, e.g. `BossDefeated`. Past tense. |
| **Projector** | bridge | Turns a domain event into component writes. Never sends commands. |
| **Process manager** | bridge | Turns one context's event into another context's command, e.g. `BossDefeated` → `BossCleared`. |
| `Handle` | ECS | Entity index + generation. Safe to store; goes stale when the slot is reused. |
| `EntityId` | ECS | An entity's row: its index in every component array, up to `MAX_ENTITIES`. Only valid this tick; called `entity`, or what it is (`player`). |
| **Signature** | ECS (`world.signature`) | The set of components an entity has, one bit each. Systems query by it; `add`, `remove` and `has` change and read it, never the values. |
| **Generation** | ECS (`world.generation`) | How many times an entity's row has been freed. A handle keeps the one it saw; a different one means the entity it pointed at is gone. |
| `NOBODY` | ECS | The handle that points at no one. Never 0: that's the first entity spawned. |
| `BossId`, `PlayerId` | domain | Stable IDs that would be saved. Mapped to handles only in `bridge/id-map.ts`. |
| `Tick` | domain | The only clock. Never wall time. |
| **Item** | ECS | A weapon entity, always in exactly one state: `Grounded`, `Held`, `Flying` or `Stuck`. It keeps its ammo and wear in every state. |
| **Wielder** | ECS | Something that holds one item. Empty hands (`NOBODY`) fight with fists. |
| **Durability** | ECS | Wear left on a sword or spear: drops per connecting swing, per throw hit, and over time while held. At 0 the item breaks. |
| **Buff** | ECS | Haste (speed) or Fury (damage) for 6 s, stored as a tick deadline (`hasteUntil`, `furyUntil`), not a countdown. |
| **Slowed** | ECS | A jump landing's movement penalty, a tick deadline plus a factor. Its own field, so a buff can never erase it. How long a slam slows is its `slowFor`; the stamp's is 0. |
| Press counters | app → ECS | `PlayerInput.throwReleases` and `interactPresses` only count up (written by the app); `Wielder.throwSeen` and `interactSeen` record what the ECS has acted on. One writer per field, no lost or doubled inputs. |
| **Seed** | ECS | The one number a run's randomness starts from, so a run replays exactly. `?seed=N` in the URL. |
| **Stream** | ECS (`streams`, `Random`) | One seeded sequence of random numbers per job (drops, perks, stock, bloom, dizzy), all started from the seed. Passed to the system that draws from it, so one system drawing more never changes another's draws. |
| **Action** | ECS | One boss attack: slam, cone, burst or jump. One at a time; `BossAction` holds the current one and the last one. |
| **Chain gap** | ECS | Minimum ticks between the end of one action and the start of the next, from `CHAIN_GAPS` per phase. 10 unless listed. |
| **Airborne** | ECS | Mid-jump. Bullets, thrown weapons and blades pass under; the boss isn't pushed by pillars or the player. |
| **Evade** | ECS | A jump away from the player, triggered by heavy damage in the last second, at most once per 8 s. |
| **Stuck** | ECS | The fourth item state: a thrown weapon lodged in its target. It drops when the target slams, lands a jump or dies. |
| **Stock** | ECS | How many of each weapon kind the arena keeps in play, in any state (`WEAPON_STOCK`). A broken one is replaced `RESPAWN_TICKS` later in a random clear spot. |
| **Charge** | ECS | Ticks a throw has been held (`Wielder.charge`, capped at 60). `throwCharge(fill)` turns it into damage, wear and speed multipliers and a zone: building, perfect (68–80%) or overcharged. |
| **Cutscene** | ECS | A tick deadline during which the player can't move, attack, throw or pick up (`controlsLocked()`). |
| **Shake** | ECS → app | Camera trauma 0..1, decayed per tick in the simulation; the wobble is drawn by the renderer and never fed back. |
| **Knockback** | ECS | A shove in m/s until a tick, in its own field; `inputSystem` adds it, staying the only writer of player velocity. |
| **Invulnerable** | ECS | Hits flash but take no hp. The boss during its roar (a tag); the player while dodging (the `Dodge.until` deadline). `hurt()` combines both. |
| **Dodge** | ECS | Shift: a 12-tick dash at a direction fixed when it starts, invulnerable throughout, passing through the boss but not pillars. A press counter like throwing; a press during the cooldown or a cutscene is dropped. |
| **Tunnel** | ECS | The onward door: the corridor through the middle of the north wall, open only while the arena is cleared. Walking past its end sends `TunnelEntered(onward)`, latched by `TunnelPending` until the run answers. |
| **Final door** | ECS | The second corridor in the north wall, behind a red gate, opened by the run when you're ready for the final (`ArenaCleared(doors)`). Walking in sends `TunnelEntered(final)`. |
| **Power** | domain | How strong the run judges you at a kill (`powerOf`): hp, revives, armor, perks, weapon. Never shown; it only decides whether the final door opens. |
| **Doors** | domain | Which doors a clear opened: `onward`, `both` or `final`. Null until the arena is cleared. |
| **Perch** | ECS | A pillar an arena's boss starts on top of (`Jump.fromHeight`); its first move is to drop in, during a short cutscene. |
| **Spawn projection** | bridge | `buildArena(arena, loadout)`: the whole ECS world rebuilt from domain state. Arena 1 and every arena after it use the same path. |
| **Lifetime** | ECS | How long a piece of state lives: the arena (`ARENA_STATE`, wiped by every build), the run (`RUN_STATE`, carried on purpose) or ever (`CONSTANTS`). |
| `Ticks` / `TickAt` | ECS | A duration in ticks, and a moment (a value `world.tick` will reach). `after(Ticks)` is the only way to make a `TickAt`. |
| `Seconds` | ECS | A duration in seconds, for countdowns integrated with `dt` (cooldowns, reloads, bullet life). Becomes ticks only through `inTicks`. |
| `Hp`, `Share`, `Meters` | ECS | Hit points; a part of a whole (0..1, e.g. "half of max hp"); a distance or radius. Branded so the compiler keeps them apart in definitions and signatures. |
| **Boss def** | ECS | `WARDEN` in `ecs/bosses/defs.ts`: what a boss spawns with (hp, radius, evade grace). `?bossHp` overrides its hp. |
| **God menu** | app (dev only) | <kbd>G</kbd> in dev builds. Debug cheats force simulation data; gameplay cheats go through the rules (sensors, or a loaded rules state). Never shipped. |
| `DevCommand` | app | One cheat, typed. Applied at the start of a tick and recorded with it, so cheats replay like inputs. |
| `GodMode` | ECS singleton | The god menu's flags (invulnerable, weapons kept, boss frozen) and `cheated`. Run lifetime; a restart clears it. |
