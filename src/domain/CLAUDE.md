# domain/

The rules: pure TypeScript. Imports nothing from `ecs/`, `bridge/`, `app/` or three.js (enforced by `npm run lint:deps`).

- Each bounded context is one folder with `state`, `decide(cmd, state) → events` and `evolve(state, event) → state`, plus a test.
- Pure functions only. Time is `Tick`, never `Date.now()`. No randomness without a seed passed in.
- Rejection is an event (or `NO_EVENTS`), never an exception. Handlers are idempotent: a duplicate command returns `NO_EVENTS`.
- Every `switch` on `kind` ends in `assertNever`.
- Keep it thin. A concept belongs here only if a rule, the save or another context reacts to it. If it changes every tick, it is ECS. Demote it when you see a command firing many times per second, a continuously changing value, a `decide` with no conditions, or a projector copying many fields one-to-one.
- IDs are domain IDs (`BossId`, `PlayerId`); entity handles never appear here.
