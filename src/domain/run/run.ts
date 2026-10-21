import { assertNever, NO_EVENTS, type BossId, type PlayerId, type Tick, type WeaponId } from '../shared/types';

// A run is a sequence of arenas. Which arena you're in, whether it's cleared,
// and what you carry between them are rules other parts depend on: the tunnel
// can be refused, the loadout carries over, the run is won or lost.
export type RunStatus = 'Fighting' | 'Cleared' | 'Won' | 'Lost';
export type WeaponKind = 'sword' | 'spear' | 'gun';
// What a perk does is the simulation's business; the run only carries which ones you hold.
export type PerkName = 'lastStand' | 'adrenaline' | 'finalShot' | 'ricochet' | 'longReach';
export const MAX_PERKS = 3;

// What passes from one arena to the next. The simulation reports it; the run
// decides it carries.
export type CarriedWeapon = { readonly id: WeaponId; readonly kind: WeaponKind; readonly durability: number; readonly ammo: number };
// perks: oldest first, as the slots hold them.
export type Loadout = { readonly hp: number; readonly weapon: CarriedWeapon | null; readonly perks: readonly PerkName[] };

// The numbers come from the simulation; they are checked once, here, where the
// loadout is made. A value no player could carry is a bug on the simulation
// side, not a rule the run decides, so it throws instead of becoming a fact.
function check(ok: boolean, what: string, value: number): void {
  if (!ok) throw new RangeError(`not a carriable ${what}: ${value}`);
}

export function carriedWeapon(id: WeaponId, kind: WeaponKind, durability: number, ammo: number): CarriedWeapon {
  check(Number.isFinite(durability) && durability >= 0, 'durability', durability);
  check(Number.isInteger(ammo) && ammo >= 0, 'ammo count', ammo);
  return { id, kind, durability, ammo };
}

// Only a living player carries anything into the next arena.
export function loadoutOf(hp: number, weapon: CarriedWeapon | null, perks: readonly PerkName[] = []): Loadout {
  check(Number.isFinite(hp) && hp > 0, 'hp', hp);
  check(perks.length <= MAX_PERKS, 'number of perks', perks.length);
  check(new Set(perks).size === perks.length, 'set of perks (a repeat)', perks.length);
  return { hp, weapon, perks: [...perks] };
}

type Run = {
  readonly arena: number; // 1-based, never past arenas
  readonly arenas: number;
  readonly loadout: Loadout; // what the current arena was entered with
};
// Only a finished run has an end tick, so "won, but when?" can't be written down.
export type RunState =
  | (Run & { readonly status: 'Fighting' | 'Cleared' })
  | (Run & { readonly status: 'Won' | 'Lost'; readonly endedAt: Tick });

export type RunCommand =
  | { kind: 'PlayerDowned'; player: PlayerId; tick: Tick }
  | { kind: 'BossCleared'; boss: BossId; tick: Tick }
  | { kind: 'TunnelEntered'; player: PlayerId; loadout: Loadout; tick: Tick };

export type RunEvent =
  | { kind: 'RunLost'; player: PlayerId; tick: Tick }
  | { kind: 'ArenaCleared'; arena: number; tick: Tick }
  | { kind: 'RunWon'; boss: BossId; tick: Tick }
  | { kind: 'ArenaEntered'; arena: number; loadout: Loadout; tick: Tick }
  | { kind: 'TunnelRefused'; reason: 'NotCleared' | 'LastArena'; tick: Tick };

export const STARTING_LOADOUT: Loadout = {
  hp: 100,
  weapon: { id: 'w-start' as WeaponId, kind: 'gun', durability: 0, ammo: 16 },
  perks: [],
};

export function initialRun(arenas: number): RunState {
  if (!Number.isInteger(arenas) || arenas < 1) throw new RangeError(`a run needs at least one arena, not ${arenas}`);
  return { arena: 1, arenas, status: 'Fighting', loadout: STARTING_LOADOUT };
}

const run = (s: RunState): Run => ({ arena: s.arena, arenas: s.arenas, loadout: s.loadout });

export function decide(cmd: RunCommand, s: RunState): readonly RunEvent[] {
  switch (cmd.kind) {
    case 'PlayerDowned':
      // Lost while the run is still going, including in a cleared arena: whether
      // you can be hurt there is the simulation's design choice, and the run must
      // answer either way. A trade on the tick of the win loses too (if we die, we
      // die), so the outcome never depends on which death was reported first.
      // After that, the outcome stands.
      return s.status === 'Fighting' || s.status === 'Cleared' || (s.status === 'Won' && s.endedAt === cmd.tick)
        ? [{ kind: 'RunLost', player: cmd.player, tick: cmd.tick }]
        : NO_EVENTS;
    case 'BossCleared':
      if (s.status !== 'Fighting') return NO_EVENTS;
      return s.arena < s.arenas
        ? [{ kind: 'ArenaCleared', arena: s.arena, tick: cmd.tick }]
        : [{ kind: 'RunWon', boss: cmd.boss, tick: cmd.tick }];
    case 'TunnelEntered':
      // Refused rather than ignored, so whatever is waiting on the answer is released.
      if (s.status !== 'Cleared') return [{ kind: 'TunnelRefused', reason: 'NotCleared', tick: cmd.tick }];
      if (s.arena >= s.arenas) return [{ kind: 'TunnelRefused', reason: 'LastArena', tick: cmd.tick }];
      // The rule for what carries over: your hp as it stands, the weapon in your hands, and your perks.
      return [{ kind: 'ArenaEntered', arena: s.arena + 1, loadout: cmd.loadout, tick: cmd.tick }];
    default:
      return assertNever(cmd);
  }
}

export function evolve(s: RunState, e: RunEvent): RunState {
  switch (e.kind) {
    case 'RunLost': return { ...run(s), status: 'Lost', endedAt: e.tick };
    case 'ArenaCleared': return { ...run(s), status: 'Cleared' };
    case 'RunWon': return { ...run(s), status: 'Won', endedAt: e.tick };
    case 'ArenaEntered':
      // decide never asks for this; a fact past the last arena means a bug upstream.
      if (e.arena > s.arenas) throw new RangeError(`arena ${e.arena} of ${s.arenas}`);
      return { ...run(s), arena: e.arena, status: 'Fighting', loadout: e.loadout };
    case 'TunnelRefused': return s;
    default: return assertNever(e);
  }
}
