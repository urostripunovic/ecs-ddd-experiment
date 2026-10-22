# ddd-ecs-arena

Greybox three.js arena: hand-written ECS for the simulation, a thin pure DDD layer for rules, a bridge between them.

- Read `docs/ARCHITECTURE.md` (zones, tick order) and `docs/GLOSSARY.md` before changing behaviour. Each zone has its own `CLAUDE.md`.
- ECS is the default. Promote a concept to `domain/` only when another area depends on its rules; being saved is not a reason.
- Commits are self-contained: each builds and passes on its own. Split a feature by layer (domain, bridge, ECS, app) only where each layer stands alone, and fold a fix into the commit that introduced the bug before pushing.
- Before you finish: `npm run check` (typecheck, tests, zone boundaries) and `npm run build`.
- Comments explain why, not what, and never where or how many: no file names, no "the only writer of", no counts of things that grow. Those go stale the moment code moves, so they belong in imports and tests (`structure.test.ts` fails on a comment naming a file). Point at a name (a function, a type) instead. A design decision ("decided with the user: nothing hurts after a clear") is exactly what a comment is for.
- Skills in `.claude/skills/` (see its README for the cycle): `rules-and-simulation` for the mechanics of any change, `game-design-interview` for the design decisions a change leaves open (ask, don't assume), `game-to-tickets` once the prototype is worth building on.
