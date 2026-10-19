# Glossary

The same idea can live at both levels under different names. Keep them apart.

| Term | Level | Meaning |
| --- | --- | --- |
| **Phase** | ECS (`BossPhase.phase`) | Which stage of the fight the boss is in (1 or 2). Written only by `bossThresholdSystem`: phase 2 at half hp, once. Not a rule, because nothing outside the fight reacts to it. |
| `BossPhase.running` | ECS component | Which phase's coroutine the ECS has started, so a new phase starts its choreography from the top. |
| **Defeated** | domain (`domain/boss`) | The boss's lifecycle: alive, then defeated, once. The run reacts to it. |
| **Slam** | ECS | A telegraphed area attack: windup ticks, radius, damage. Pure simulation. |
| **Run** | domain (`domain/run`) | A sequence of arenas: which one you're in, whether it's `Fighting`, `Cleared`, `Won` or `Lost`, and the loadout it was entered with. |
| **Loadout** | domain | What passes between arenas: hp and the held weapon (kind, wear, ammo, and its `WeaponId`). The run starts you with the gun. |
| `RunView` | ECS singleton | Projected copy of the run (status, arena, whether the tunnel is open) that systems and the HUD read. Typed read-only; only `bridge/` can import its writable side (`RunViewWritable`), so only the run projector and the spawn projection write it. |
| **Command** | bridge | Something the simulation asks the domain, e.g. `BossDowned`. Imperative or attempt. |
| **Domain event** | domain | A fact the domain decided, e.g. `BossDefeated`. Past tense. |
| **Projector** | bridge | Turns a domain event into component writes. Never sends commands. |
| **Process manager** | bridge | Turns one context's event into another context's command, e.g. `BossDefeated` → `BossCleared`. |
| `Handle` | ECS | Entity index + generation. Safe to store; goes stale when the slot is reused. |
| `BossId`, `PlayerId` | domain | Stable IDs that would be saved. Mapped to handles only in `bridge/id-map.ts`. |
| `Tick` | domain | The only clock. Never wall time. |
| **Item** | ECS | A weapon entity, always in exactly one state: `Grounded`, `Held`, `Flying` or `Stuck`. It keeps its ammo and wear in every state. |
| **Wielder** | ECS | Something that holds one item. Empty hands (`NO_HANDLE`) fight with fists. |
| **Durability** | ECS | Wear left on a sword or spear: drops per connecting swing, per throw hit, and over time while held. At 0 the item breaks. |
| **Buff** | ECS | Haste (speed) or Fury (damage) for 6 s, stored as a tick deadline (`hasteUntil`, `furyUntil`), not a countdown. |
| **Slowed** | ECS | A jump landing's movement penalty, a tick deadline plus a factor. Its own field, so a buff can never erase it. How long a slam slows is its `slowFor`; the stamp's is 0. |
| Press counters | app → ECS | `PlayerInput.throwReleases` and `interactPresses` only count up (written by the app); `Wielder.throwSeen` and `interactSeen` record what the ECS has acted on. One writer per field, no lost or doubled inputs. |
| **Seed** | ECS | Fixes the RNG for drops, so a run replays exactly. `?seed=N` in the URL. |
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
| **Tunnel** | ECS | The corridor through the north wall, open only while the arena is cleared. Walking past its end sends `TunnelEntered`, latched by `TunnelPending` until the run answers. |
| **Perch** | ECS | A pillar an arena's boss starts on top of (`Jump.fromHeight`); its first move is to drop in, during a short cutscene. |
| **Spawn projection** | bridge | `buildArena(arena, loadout)`: the whole ECS world rebuilt from domain state. Arena 1 and every arena after it use the same path. |
| **Lifetime** | ECS | How long a piece of state lives: the arena (`ARENA_STATE`, wiped by every build), the run (`RUN_STATE`, carried on purpose) or ever (`CONSTANTS`). |
| `Ticks` / `TickAt` | ECS | A duration in ticks, and a moment (a value `world.tick` will reach). `after(Ticks)` is the only way to make a `TickAt`. |
| `Seconds` | ECS | A duration in seconds, for countdowns integrated with `dt` (cooldowns, reloads, bullet life). Becomes ticks only through `inTicks`. |
| `Hp`, `Share`, `Meters` | ECS | Hit points; a part of a whole (0..1, e.g. "half of max hp"); a distance or radius. Branded so the compiler keeps them apart in definitions and signatures. |
| **Boss def** | ECS | `WARDEN` in `ecs/bosses/defs.ts`: what a boss spawns with (hp, radius, evade grace). `?bossHp` overrides its hp. |
