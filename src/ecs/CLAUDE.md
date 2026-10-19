# ecs/

The real-time simulation. Imports nothing from `domain/`, `bridge/`, `app/` or three.js (enforced by `npm run lint:deps`).

- Components are structure-of-arrays typed arrays in `components/`. No objects per entity.
- No allocation inside systems: no closures, `map`/`filter`, spread or template strings in a per-tick path. Query into a buffer from `core/buffers.ts`; a helper called while a system walks `buf` uses its own buffer.
- Each system starts with a `// reads X | writes Y` line. Keep it true.
- Sensors that talk to the domain are edge-triggered and latched (`Dead`, `TunnelPending`), so a command fires once.
- Systems only `send()` to the outbox. They never call the domain and never write domain-owned components: `RunView` is typed read-only here, and only `bridge/` may import its writable side (`components/run-view.ts`, enforced by the zone lint).
- Coroutines in `systems/boss-scripts.ts` are choreography inside one phase. Nothing that must survive a save goes in a coroutine.
- Never keep an `EntityId` across ticks; store a `Handle`. "Nobody" is `NO_HANDLE`, not 0. A field that holds handles is made with `handleField()`, so tools can name what it points at.
- Every component and singleton is listed in exactly one of `ARENA_STATE`, `RUN_STATE` or `CONSTANTS`. Adding one means choosing its lifetime.
- Numbers with a unit are branded at the edges (`core/units.ts`): definitions, constructors and signatures. Make deadlines with `after()`, never `world.tick + n`; turn seconds into ticks with `inTicks(seconds(n))`, never `* 60`.
