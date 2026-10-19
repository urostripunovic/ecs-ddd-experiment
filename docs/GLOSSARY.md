# Glossary

The same idea can live at both levels under different names. Keep them apart.

| Term | Level | Meaning |
| --- | --- | --- |
| **Phase** | domain (`domain/boss`) | Which stage of the fight the boss is in (1 or 2). Saved truth. Changes only through `evolve`. |
| `BossPhase.phase` | ECS component | Projected copy of the phase. Written only by the boss projector. |
| `BossPhase.running` | ECS component | Which phase's coroutine the ECS has started. 0 after a load, so choreography restarts. |
| **Threshold crossed** | ECS → command | The boss's hp fell to the phase-2 share. A request; the domain decides what it means. |
| **Slam** | ECS | A telegraphed area attack: windup ticks, radius, damage. Pure simulation. |
| **Match** | domain (`domain/match`) | Whether the fight is `Fighting`, `Won` or `Lost`. |
| `MatchView` | ECS singleton | Projected copy of the match status that systems and the HUD read. |
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
| **Slowed** | ECS | The slam's movement penalty, a tick deadline plus a factor. Its own field, so a buff can never erase it. |
| Press counters | app → ECS | `PlayerInput.throwPresses` only counts up (written by the app); `Wielder.throwSeen` records what the ECS has acted on. One writer per field, no lost or doubled presses. |
| **Seed** | ECS | Fixes the RNG for drops, so a run replays exactly. `?seed=N` in the URL. |
| **Action** | ECS | One boss attack: slam, cone, burst or jump. One at a time; `BossAction` holds the current one and the last one. |
| **Chain gap** | ECS | Minimum ticks between the end of one action and the start of the next, from `CHAIN_GAPS` per phase. 10 unless listed. |
| **Airborne** | ECS | Mid-jump. Bullets, thrown weapons and blades pass under; the boss isn't pushed by pillars or the player. |
| **Evade** | ECS | A jump away from the player, triggered by heavy damage in the last second, at most once per 8 s. |
| **Stuck** | ECS | The fourth item state: a thrown weapon lodged in its target. It drops when the target slams, lands a jump or dies. |
| **Stock** | ECS | How many of each weapon kind the arena keeps in play, in any state (`WEAPON_STOCK`). A broken one is replaced `RESPAWN_TICKS` later in a random clear spot. |
