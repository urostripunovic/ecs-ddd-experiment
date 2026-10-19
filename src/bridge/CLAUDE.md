# bridge/

The only folder that imports both `domain/` and `ecs/`. Never imports `app/` or three.js.

- One folder per bounded context, mirroring `domain/<context>/`: `commands.ts` (outbox slot → domain command), `projector.ts` (domain event → component writes), `flow.test.ts` (seam test: command in, component values out).
- Projectors write components and never send commands. Any new command comes from the simulation on the next tick, so loops are bounded by the tick.
- Cross-context reactions are process managers (e.g. `runCommandFromBoss`), run by `dispatch.ts` with a fixed maximum depth.
- Entity handles ↔ domain IDs only through `id-map.ts`. Check `isLive` before writing to a handle: the entity may have died this tick.
- Every chain step goes through `logChain` so the dev tick log shows command → event → component write.
- A projector never rebuilds the world itself; it records the request (`takePendingArena`), and `dispatch.ts` builds after the step.
- The outbox itself lives in `ecs/core/outbox.ts` so `ecs/` never imports `bridge/`; `dispatch.ts` drains it.
- `buildArena` builds from every rules state, not only the ones play reaches (a cleared arena has its boss down and its tunnel open), because it's also what a load would use. `run/load.test.ts` checks each state in the rules examples.
