# domain/

The rules: pure TypeScript. Imports nothing from `ecs/`, `bridge/`, `app/` or three.js (enforced by `npm run lint:deps`).

- Each bounded context is one folder with `state`, `decide(cmd, state) → events` and `evolve(state, event) → state`, plus a test.
- Pure functions only. Time is `Tick`, never `Date.now()`. No randomness without a seed passed in.
- Rejection is an event (or `NO_EVENTS`), never an exception. Handlers are idempotent: a duplicate command returns `NO_EVENTS`.
- Numbers from the simulation are checked once, by a constructor where they enter (`loadoutOf`, `carriedWeapon`). A value no player could have is a bug on the other side, so it throws; it never becomes a fact.
- States with different invariants are different types (`RunState`: only a finished run has `endedAt`). Don't wrap every field: only where an invalid combination would matter.
- Every `switch` on `kind` ends in `assertNever`.
- Keep it thin. A concept belongs here only if another context depends on its rules; being saved is not a reason. If it changes every tick, it is ECS. Demote it when you see a command firing many times per second, a continuously changing value, a `decide` with no conditions, or a projector copying many fields one-to-one.
- IDs are domain IDs (`BossId`, `PlayerId`); entity handles never appear here.
