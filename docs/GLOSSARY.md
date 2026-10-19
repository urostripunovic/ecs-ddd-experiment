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
