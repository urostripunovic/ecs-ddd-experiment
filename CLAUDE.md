# ddd-ecs-arena

Greybox three.js arena: hand-written ECS for the simulation, a thin pure DDD layer for rules, a bridge between them.

- Read `docs/ARCHITECTURE.md` (zones, tick order) and `docs/GLOSSARY.md` before changing behaviour. Each zone has its own `CLAUDE.md`.
- ECS is the default. Promote a concept to `domain/` only when another area depends on its rules; being saved is not a reason.
- A feature is usually one commit per layer: domain, bridge, ECS, app.
- Before you finish: `npm run check` (typecheck, tests, zone boundaries) and `npm run build`.
- Comments explain why, not what.
- Skills in `.claude/skills/`: `rules-and-simulation` for the mechanics of any change, `game-design-interview` for the design decisions a change leaves open. Ask those; don't assume them.
