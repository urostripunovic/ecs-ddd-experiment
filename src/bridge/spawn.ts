import { initialBoss, type BossState } from '../domain/boss/boss';
import type { Loadout, RunState, RunStatus as RunStatusName } from '../domain/run/run';
import type { BossId } from '../domain/shared/types';
import { ARENAS, PILLAR_HEIGHT, PILLAR_RADIUS } from '../ecs/arenas';
import { Ammo, C, Durability, Health, Jump, RunStatus, resetArenaState, resetRunState } from '../ecs/components';
import { RunViewWritable } from '../ecs/components/run-view';
import { clearOutbox } from '../ecs/core/outbox';
import { seedRng } from '../ecs/core/rng';
import { hp } from '../ecs/core/units';
import { add, NOBODY, resetWorld, toHandle, type EntityId, type Handle } from '../ecs/core/world';
import { spawnBoss, spawnOrbitingPillar, spawnPillar, spawnPlayer, spawnWeapon } from '../ecs/prefabs';
import { resetScripts } from '../ecs/systems/boss';
import { equip } from '../ecs/systems/weapons';
import { WEAPON_STOCK } from '../ecs/weapons/defs';
import { bossIdFor, PLAYER_ID } from './ids';
import { idMap } from './id-map';
import { KIND_NUMBER, PERK_NUMBER } from './run/loadout';
import { setPerks } from '../ecs/systems/perks';
import { store } from './store';
import { clearTickLog } from './tick-log';

export { BOSS_ID, PLAYER_ID } from './ids';

// The seed fixes every random drop, so a run can be replayed exactly.
export type RunOptions = { bossHp?: number; seed?: number };
export type RunHandles = { player: Handle; boss: Handle };

// One object, updated in place by every build, so whoever holds it (the app,
// the camera) follows the player into the next arena without asking again.
export const handles: RunHandles = { player: NOBODY, boss: NOBODY };

// The run's status as the simulation reads it. A Record, so a new status
// breaks the build here instead of loading as something else.
const VIEW_STATUS: Record<RunStatusName, number> = {
  Fighting: RunStatus.Fighting, Cleared: RunStatus.Cleared, Won: RunStatus.Won, Lost: RunStatus.Lost,
};

// Built already down, so the death sensor never reports it again: the rules
// have decided this one.
function downed(entity: EntityId): void {
  Health.hp[entity] = 0;
  add(entity, C.Dead);
}
let options: RunOptions = {};

export function startRun(opts: RunOptions = {}): RunHandles {
  options = opts;
  resetWorld();
  resetRunState();
  clearOutbox();
  clearTickLog();
  idMap.clear();
  store.reset();
  seedRng(opts.seed ?? 1);
  buildArena(store.run.arena, store.run.loadout);
  return handles;
}

// Loading: replace the rules' state, then build the world from it by the same
// path as every arena. Saves, the load test and the dev menu's jumps use it.
export function loadRunState(run: RunState, bosses: ReadonlyMap<BossId, BossState>): void {
  store.run = run;
  store.bosses = new Map(bosses);
  buildArena(run.arena, run.loadout);
}

// The spawn projection: the ECS world rebuilt purely from domain state. Arena 1
// and every arena after it are built by this one path, so a save/load would be too.
// It reads every rules state, not only the ones play reaches when entering an
// arena: a cleared arena is built cleared, a lost run with the player down.
export function buildArena(arena: number, loadout: Loadout): void {
  resetWorld(true);
  resetArenaState();
  resetScripts();
  idMap.unbindHandles();
  const layout = ARENAS[arena - 1];

  // Pillars are pure simulation (cover), so the domain never hears of them.
  for (const [x, z] of layout.pillars) spawnPillar(x, z, PILLAR_RADIUS);
  const [ox, oz] = layout.orbitCenter;
  for (const orbit of layout.orbiting) spawnOrbitingPillar(ox, oz, orbit, PILLAR_RADIUS);

  const [px, pz] = layout.playerStart;
  const p = spawnPlayer(px, pz);
  Health.hp[p] = loadout.hp;
  setPerks(p, loadout.perks.map((name) => PERK_NUMBER[name]));
  idMap.bind(toHandle(p), { context: 'player', id: PLAYER_ID });

  let carriedKind = 0;
  if (loadout.weapon) {
    carriedKind = KIND_NUMBER[loadout.weapon.kind];
    const w = spawnWeapon(carriedKind, px, pz);
    Durability.value[w] = loadout.weapon.durability;
    Ammo.count[w] = loadout.weapon.ammo;
    equip(p, w);
    idMap.bind(toHandle(w), { context: 'weapon', id: loadout.weapon.id });
  }

  // The rest of the stock, laid out where this arena puts weapons.
  let spot = 0;
  for (let kind = 1; kind < WEAPON_STOCK.length; kind++) {
    const count = WEAPON_STOCK[kind] - (kind === carriedKind ? 1 : 0);
    for (let n = 0; n < count && spot < layout.weaponSpots.length; n++) {
      const [x, z] = layout.weaponSpots[spot++];
      spawnWeapon(kind, x, z);
    }
  }

  const bossId = bossIdFor(arena);
  const [bx, bz] = layout.bossStart;
  // ?bossHp shortens the fight while tuning; everything else comes from the def.
  const def = options.bossHp ? { ...layout.boss, hp: hp(options.bossHp) } : layout.boss;
  const b = spawnBoss(def, bx, bz);
  if (!store.bosses.has(bossId)) store.bosses.set(bossId, initialBoss(bossId));
  const bossState = store.bosses.get(bossId)!;
  if (bossState.defeated) downed(b);
  else if (layout.perch >= 0) {
    // Up on its perch: out of reach until it drops in.
    add(b, C.Airborne);
    Jump.fromHeight[b] = PILLAR_HEIGHT;
  }
  idMap.bind(toHandle(b), { context: 'boss', id: bossId });
  if (store.run.status === 'Lost') downed(p);

  RunViewWritable.arena = arena;
  RunViewWritable.arenas = store.run.arenas;
  RunViewWritable.status = VIEW_STATUS[store.run.status];
  RunViewWritable.endedAt = store.run.status === 'Won' || store.run.status === 'Lost' ? store.run.endedAt : 0;
  // The run projector opens it on ArenaCleared; a loaded clear must open it too.
  RunViewWritable.tunnelOpen = store.run.status === 'Cleared';
  handles.player = toHandle(p);
  handles.boss = toHandle(b);
}
