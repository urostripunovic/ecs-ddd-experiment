import { assertNever, NO_EVENTS, type BossId, type PlayerId, type Tick, type WeaponId } from '../shared/types';

// A run is a sequence of arenas. Which arena you're in, whether it's cleared,
// and what you carry between them are what a save would hold, so they live here.
export type RunStatus = 'Fighting' | 'Cleared' | 'Won' | 'Lost';
export type WeaponKind = 'sword' | 'spear' | 'gun';

// What passes from one arena to the next. The simulation reports it; the run
// decides it carries.
export type CarriedWeapon = { readonly id: WeaponId; readonly kind: WeaponKind; readonly durability: number; readonly ammo: number };
export type Loadout = { readonly hp: number; readonly weapon: CarriedWeapon | null };

export type RunState = {
  readonly arena: number; // 1-based
  readonly arenas: number;
  readonly status: RunStatus;
  readonly loadout: Loadout; // what the current arena was entered with
  readonly endedAt: Tick | null;
};

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
};

export const initialRun = (arenas: number): RunState =>
  ({ arena: 1, arenas, status: 'Fighting', loadout: STARTING_LOADOUT, endedAt: null });

export function decide(cmd: RunCommand, s: RunState): readonly RunEvent[] {
  switch (cmd.kind) {
    case 'PlayerDowned':
      // Lost while the run is still going, including in a cleared arena: whether
      // you can be hurt there is the simulation's design choice, and the run must
      // answer either way. Once won or lost, the first outcome stands.
      return s.status === 'Fighting' || s.status === 'Cleared'
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
      // The rule for what carries over: your hp as it stands, and the weapon in your hands.
      return [{ kind: 'ArenaEntered', arena: s.arena + 1, loadout: cmd.loadout, tick: cmd.tick }];
    default:
      return assertNever(cmd);
  }
}

export function evolve(s: RunState, e: RunEvent): RunState {
  switch (e.kind) {
    case 'RunLost': return { ...s, status: 'Lost', endedAt: e.tick };
    case 'ArenaCleared': return { ...s, status: 'Cleared' };
    case 'RunWon': return { ...s, status: 'Won', endedAt: e.tick };
    case 'ArenaEntered': return { ...s, arena: e.arena, status: 'Fighting', loadout: e.loadout };
    case 'TunnelRefused': return s;
    default: return assertNever(e);
  }
}
