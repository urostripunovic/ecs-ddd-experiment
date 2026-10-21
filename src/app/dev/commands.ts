// Dev-only cheats, as one typed list: the menu, the bot, the recorder and tests
// all send these. Two levels:
// - debug: forces simulation data (god toggles, a weapon, a field). Fine, because
//   the rules' sensors still watch the simulation.
// - gameplay: goes through the rules (the boss's hp to 0 lets the death sensor
//   report it; a jump loads a rules state like a save).
// Never a fact injected into the rules, never a write to RunView: the world and
// the rules would disagree, which is exactly what the load test guards against.
import { initialBoss, type BossState } from '../../domain/boss/boss';
import { initialRun, STARTING_LOADOUT, type PerkName, type RunState } from '../../domain/run/run';
import { PERK_NUMBER } from '../../bridge/run/loadout';
import { addPerk } from '../../ecs/systems/perks';
import type { BossId, Tick } from '../../domain/shared/types';
import { bossIdFor } from '../../bridge/ids';
import { disagreements } from '../../bridge/run/agree';
import { handles, loadRunState } from '../../bridge/spawn';
import { store } from '../../bridge/store';
import { logChain } from '../../bridge/tick-log';
import { ARENA_STATE, C, GodMode, Health, holdsHandles, Jump, LastHit, Shape, ShapeKind } from '../../ecs/components';
import { indexOf, isLive, MAX_ENTITIES, NOBODY, remove, world, type Handle } from '../../ecs/core/world';
import { giveWeapon } from '../../ecs/systems/weapons';
import { WeaponKind } from '../../ecs/weapons/defs';

export type JumpTarget = 'arena1' | 'arena1Cleared' | 'arena2' | 'arena2Phase2' | 'won';
export type ArenaComponent = keyof typeof ARENA_STATE;

export type DevCommand =
  | { kind: 'god'; flag: 'invulnerable' | 'keepWeapons' | 'freezeBoss'; on: boolean }
  | { kind: 'give'; weapon: 'sword' | 'spear' | 'gun' }
  | { kind: 'perk'; perk: PerkName }
  | { kind: 'heal' }
  | { kind: 'set'; entity: Handle; component: ArenaComponent; field: string; value: number }
  | { kind: 'damageBoss'; amount: number }
  | { kind: 'killBoss' }
  | { kind: 'jump'; to: JumpTarget };

export const LEVEL: Record<DevCommand['kind'], 'debug' | 'gameplay'> = {
  god: 'debug', give: 'debug', perk: 'debug', heal: 'debug', set: 'debug',
  damageBoss: 'gameplay', killBoss: 'gameplay', jump: 'gameplay',
};

export type Recorded = { readonly tick: number; readonly cmd: DevCommand };

// Cheats are inputs: each is applied at the start of a tick and recorded with
// it, so the same seed, inputs and cheats replay the same run.
const pending: Recorded[] = [];
const history: Recorded[] = [];
let lastCheck: string[] = [];

export function queueDev(cmd: DevCommand): void {
  pending.push({ tick: world.tick, cmd });
}

export function replayDev(recorded: readonly Recorded[]): void {
  pending.push(...recorded);
}

export const devHistory = (): readonly Recorded[] => history.slice();
// What the last jump's agreement check found; empty means the world agrees with the rules.
export const lastJumpCheck = (): readonly string[] => lastCheck;

export function clearDev(): void {
  pending.length = 0;
  history.length = 0;
  lastCheck = [];
}

// First thing in a tick, before any system runs.
export function applyDevCommands(): void {
  for (let i = 0; i < pending.length; ) {
    const r = pending[i];
    if (r.tick > world.tick) { i++; continue; }
    pending.splice(i, 1);
    history.push({ tick: world.tick, cmd: r.cmd });
    GodMode.cheated = true;
    apply(r.cmd);
    logChain(`cheat (${LEVEL[r.cmd.kind]}): ${describe(r.cmd)}`);
  }
}

function describe(cmd: DevCommand): string {
  switch (cmd.kind) {
    case 'god': return `${cmd.flag} ${cmd.on ? 'on' : 'off'}`;
    case 'give': return `give ${cmd.weapon}`;
    case 'perk': return `perk ${cmd.perk}`;
    case 'heal': return 'heal';
    case 'set': return `set ${cmd.component}.${cmd.field}=${cmd.value}`;
    case 'damageBoss': return `damage boss ${cmd.amount}`;
    case 'killBoss': return 'kill boss';
    case 'jump': return `jump to ${cmd.to}`;
    default: return assertNever(cmd);
  }
}

const WEAPON = { sword: WeaponKind.Sword, spear: WeaponKind.Spear, gun: WeaponKind.Gun } as const;

function apply(cmd: DevCommand): void {
  const p = isLive(handles.player) ? indexOf(handles.player) : -1;
  const b = isLive(handles.boss) ? indexOf(handles.boss) : -1;
  switch (cmd.kind) {
    case 'god':
      GodMode[cmd.flag] = cmd.on;
      return;
    case 'give':
      if (p !== -1) giveWeapon(p, WEAPON[cmd.weapon]);
      return;
    case 'perk':
      if (p !== -1) addPerk(p, PERK_NUMBER[cmd.perk]);
      return;
    case 'heal':
      if (p !== -1) Health.hp[p] = Health.max[p];
      return;
    case 'set': {
      if (!isLive(cmd.entity)) return;
      const field = (ARENA_STATE[cmd.component] as Record<string, unknown>)[cmd.field];
      if (ArrayBuffer.isView(field) && (field as Float32Array).length === MAX_ENTITIES) (field as Float32Array)[indexOf(cmd.entity)] = cmd.value;
      return;
    }
    case 'damageBoss':
    case 'killBoss':
      // The sensors do the rest: the phase threshold, the death, the rules' chain.
      if (b === -1) return;
      Health.hp[b] = cmd.kind === 'killBoss' ? 0 : Math.max(0, Health.hp[b] - cmd.amount);
      LastHit.by[b] = handles.player;
      return;
    case 'jump':
      jump(cmd.to);
      return;
    default:
      assertNever(cmd);
  }
}

// A jump is a load: build the run the rules would be in, then the world from it.
function jump(to: JumpTarget): void {
  const arenas = store.run.arenas;
  const arena = to === 'arena1' || to === 'arena1Cleared' ? 1 : to === 'won' ? arenas : 2;
  const bosses = new Map<BossId, BossState>();
  const beaten = to === 'arena1' ? 0 : to === 'arena1Cleared' ? 1 : to === 'won' ? arenas : arena - 1;
  for (let a = 1; a <= arenas; a++) {
    bosses.set(bossIdFor(a), { ...initialBoss(bossIdFor(a)), defeated: a <= beaten });
  }
  const base = { ...initialRun(arenas, store.run.seed), arena, loadout: STARTING_LOADOUT };
  const run: RunState =
    to === 'won' ? { ...base, status: 'Won', endedAt: world.tick as Tick }
    : to === 'arena1Cleared' ? { ...base, status: 'Cleared' }
    : { ...base, status: 'Fighting' };
  loadRunState(run, bosses);

  if (to === 'arena2Phase2' && isLive(handles.boss)) {
    // Off the perch and at half hp, so phase 2 opens on the next tick.
    const b = indexOf(handles.boss);
    remove(b, C.Airborne);
    Jump.fromHeight[b] = 0;
    Health.hp[b] = Health.max[b] / 2;
  }
  lastCheck = disagreements();
  if (lastCheck.length > 0) logChain(`cheat check: world and rules disagree: ${lastCheck.join('; ')}`);
}

// points: set when the field holds a handle, so the menu can name the entity
// and jump to it instead of showing the packed number.
export type Field = {
  readonly component: ArenaComponent; readonly field: string; readonly value: number; readonly points?: Handle;
};

const SHAPE_NAME = Object.fromEntries(Object.entries(ShapeKind).map(([k, v]) => [v, k])) as Record<number, string>;

// How a handle reads in the menu and logs: "Gun #6", "none", or "gone #6" for one
// whose entity has died (its slot may hold something else by now).
export function nameOf(h: Handle): string {
  if (h === NOBODY) return 'none';
  const e = indexOf(h);
  if (!isLive(h)) return `gone #${e}`;
  return `${SHAPE_NAME[Shape.kind[e]] ?? 'entity'} #${e}`;
}

// The inspector's view of one entity: every per-entity field that isn't zero,
// read from the declared component list. Arrays not indexed by entity (the
// weapon stock) and singletons are skipped.
export function inspect(h: Handle): Field[] {
  if (!isLive(h)) return [];
  const e = indexOf(h);
  const out: Field[] = [];
  for (const [component, group] of Object.entries(ARENA_STATE)) {
    for (const [field, arr] of Object.entries(group as Record<string, unknown>)) {
      if (!ArrayBuffer.isView(arr) || (arr as Float32Array).length !== MAX_ENTITIES) continue;
      const value = (arr as Float32Array)[e];
      if (value === 0) continue;
      out.push(holdsHandles(arr)
        ? { component: component as ArenaComponent, field, value, points: value as Handle }
        : { component: component as ArenaComponent, field, value });
    }
  }
  return out;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled dev command: ${JSON.stringify(x)}`);
}
