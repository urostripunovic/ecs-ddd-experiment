# ecs/

The real-time simulation. Imports nothing from `domain/`, `bridge/`, `app/` or three.js (enforced by `npm run lint:deps`).

- Components are structure-of-arrays typed arrays in `components/`. No objects per entity.
- No allocation inside systems: no closures, `map`/`filter`, spread or template strings in a per-tick path. Query into a buffer from `core/buffers.ts`; a helper called while a system walks `buf` uses its own buffer.
- Each system starts with a `// reads X | writes Y` line. Keep it true.
- Sensors that talk to the domain are edge-triggered and latched (`Dead`, `TunnelPending`), so a command fires once.
- Systems only `send()` to the outbox. They never call the domain and never write domain-owned components: `RunView` is typed read-only here, and only `bridge/` may import its writable side (`components/run-view.ts`, enforced by the zone lint).
- Coroutines in `systems/boss-scripts/` are choreography inside one phase. Nothing that must survive a save goes in a coroutine.
- Never keep an `EntityId` across ticks; store a `Handle`. "Nobody" is `NOBODY`, not 0. Name an `EntityId` `entity`, or what it is (`player`, `sword`). A field that holds handles is made with `handleField(tag)`, so tools can name what it points at; the tag is what a row needs for its cell to count.
- Clear a handle before freeing what it points at, as `breakItem` does. In dev builds and tests, `despawn` fails if a live note still points at the row, naming both ends.
- Every component and singleton is listed in exactly one of `ARENA_STATE`, `RUN_STATE` or `CONSTANTS`. Adding one means choosing its lifetime.
- Numbers with a unit are branded at the edges (`core/units.ts`): definitions, constructors and function signatures. Make deadlines with `after()`, never `world.tick + n`; turn seconds into ticks with `inTicks(seconds(n))`, never `* 60`.
- A module that loses its single job becomes a folder of modules by job, re-exported from the old file so importers don't change (`systems/weapons/`, `systems/boss-scripts/`). Size is a hint, not the rule.
- How a weapon behaves is a field on its definition (`WeaponDef`), never a check of its kind in a system.
