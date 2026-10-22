// What the special weapons leave in the world after the swing or the shot: fire
// that keeps burning, and the railgun's beam. Swinging, shooting and throwing
// them is the weapon systems' job, as for every other weapon.
import { Arena, Burn, C, Collider, Team, Tracer, Transform } from '../components';
import { buf, helperBuf, solidBuf, targetBuf } from '../core/buffers';
import { inSeconds, ticks, type TickAt } from '../core/units';
import { despawn, entityAt, handleAt, has, mask, query, world, type EntityId, type Handle } from '../core/world';
import { spawnTracer } from '../prefabs';
import { RAIL_TRACER_TICKS } from '../weapons/defs';
import { hurt } from './damage';
import { pushPillar } from './pillars';

const BURNABLE = mask(C.Health, C.Transform);
const TARGETS = mask(C.Health, C.Transform, C.Team, C.Collider);
const UNHITTABLE = mask(C.Dead, C.Airborne);
const SOLIDS = mask(C.Transform, C.Collider, C.Solid);
const PER_TICK = inSeconds(ticks(1));

// reads Burn | writes Health (via hurt)
// A tick's share of the burn, every tick until its deadline. Through hurt like
// any hit, so a roar or a dodge shrugs it off too.
export function burnSystem(): void {
  const n = query(buf, BURNABLE, C.Dead);
  for (let i = 0; i < n; i++) {
    const entity = entityAt(buf, i);
    if (world.tick >= Burn.until[entity]) continue;
    hurt(entity, Burn.dps[entity] * PER_TICK, handleAt(Burn.by, entity));
  }
}

// reads Tracer | despawns spent tracers
export function tracerSystem(): void {
  const n = query(helperBuf, C.Tracer);
  for (let i = n - 1; i >= 0; i--) {
    const tracer = entityAt(helperBuf, i);
    if (world.tick >= Tracer.until[tracer]) despawn(tracer);
  }
}

// How far along a ray from (x, z) in direction (dx, dz) it first meets a circle,
// or Infinity if it never does. Starting inside counts as meeting it at once.
export function rayToCircle(x: number, z: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const ox = x - cx;
  const oz = z - cz;
  const along = ox * dx + oz * dz;
  const c = ox * ox + oz * oz - r * r;
  if (c <= 0) return 0;
  const disc = along * along - c;
  if (along > 0 || disc < 0) return Infinity;
  return -along - Math.sqrt(disc);
}

// The railgun's beam: from (x, z) along the unit direction until the first
// pillar or the wall, knocking that pillar along it (pushPillar), and hurting
// every enemy of `team` it passes through on the
// way. Pierces bodies, stops at stone; passes under anything mid-jump.
export function fireBeam(x: number, z: number, dx: number, dz: number, team: number, by: Handle, dmg: number): void {
  let reach = Infinity;
  // To the wall first: the arena is a square, so the nearer of the two edges it heads for.
  const edge = Arena.half;
  if (dx !== 0) reach = Math.min(reach, ((dx > 0 ? edge : -edge) - x) / dx);
  if (dz !== 0) reach = Math.min(reach, ((dz > 0 ? edge : -edge) - z) / dz);
  const solids = query(solidBuf, SOLIDS, C.Dead);
  let stoppedBy: EntityId | -1 = -1;
  for (let j = 0; j < solids; j++) {
    const solid = entityAt(solidBuf, j);
    if (has(solid, C.Health)) continue; // bodies are pierced, not walls
    const at = rayToCircle(x, z, dx, dz, Transform.x[solid], Transform.z[solid], Collider.radius[solid]);
    if (at < reach) { reach = at; stoppedBy = solid; }
  }
  // The pillar that took the shot is knocked along the beam.
  if (stoppedBy !== -1) pushPillar(stoppedBy, dx, dz);
  const targets = query(targetBuf, TARGETS, UNHITTABLE);
  for (let j = 0; j < targets; j++) {
    const target: EntityId = entityAt(targetBuf, j);
    if (Team.id[target] === team) continue;
    if (rayToCircle(x, z, dx, dz, Transform.x[target], Transform.z[target], Collider.radius[target]) <= reach) {
      hurt(target, dmg, by);
    }
  }
  spawnTracer(x, z, x + dx * reach, z + dz * reach, RAIL_TRACER_TICKS);
}

// Sets a target burning, or keeps it burning: the newest flame's strength and a fresh deadline.
export function ignite(target: EntityId, dps: number, until: TickAt, by: Handle): void {
  Burn.until[target] = until;
  Burn.dps[target] = dps;
  Burn.by[target] = by;
}
