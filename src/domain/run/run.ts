import { assertNever, NO_EVENTS, type BossId, type PlayerId, type Tick, type WeaponId } from '../shared/types';

// A run is a sequence of arenas. Which arena you're in, whether it's cleared,
// and what you carry between them are rules other parts depend on: the tunnel
// can be refused, the loadout carries over, the run is won or lost.
export type RunStatus = 'Fighting' | 'Cleared' | 'Won' | 'Lost';
export type WeaponKind = 'sword' | 'spear' | 'gun' | 'scattergun';
// What a perk does is the simulation's business; the run only carries which ones you hold.
export type PerkName = 'lastStand' | 'adrenaline' | 'finalShot' | 'ricochet' | 'longReach';
export const MAX_PERKS = 3;
// Armor plates each block one hit; the simulation breaks them, the loadout carries what's left.
export const MAX_ARMOR = 3;

// What passes from one arena to the next. The simulation reports it; the run
// decides it carries.
export type CarriedWeapon = { readonly id: WeaponId; readonly kind: WeaponKind; readonly durability: number; readonly ammo: number };
// perks: oldest first, as the slots hold them. armor: plates left.
export type Loadout = {
  readonly hp: number; readonly weapon: CarriedWeapon | null; readonly perks: readonly PerkName[]; readonly armor: number;
};

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
export function loadoutOf(hp: number, weapon: CarriedWeapon | null, perks: readonly PerkName[] = [], armor = 0): Loadout {
  check(Number.isFinite(hp) && hp > 0, 'hp', hp);
  check(perks.length <= MAX_PERKS, 'number of perks', perks.length);
  check(new Set(perks).size === perks.length, 'set of perks (a repeat)', perks.length);
  check(Number.isInteger(armor) && armor >= 0 && armor <= MAX_ARMOR, 'number of armor plates', armor);
  return { hp, weapon, perks: [...perks], armor };
}

// What a cleared boss can leave behind. The run decides what's offered and what's
// taken; what each one does to the world is the simulation's, through the projector.
export type Reward = 'revive' | 'armor' | 'heal' | 'scattergun';
const REWARD_POOL: readonly Reward[] = ['revive', 'armor', 'heal', 'scattergun'];
export const OFFER_SIZE = 3;
export const STARTING_REVIVES = 3;
export const MAX_REVIVES = 8;

type Run = {
  readonly arena: number; // 1-based, never past arenas
  readonly arenas: number;
  readonly loadout: Loadout; // what the current arena was entered with
  // Draws everything the run decides by chance, so a seed replays the run.
  readonly seed: number;
  readonly revives: number;
  // Three rewards to pick one from, after a clear; null when there's nothing to pick.
  readonly offer: readonly Reward[] | null;
};
// Only a finished run has an end tick, so "won, but when?" can't be written down.
export type RunState =
  | (Run & { readonly status: 'Fighting' | 'Cleared' })
  | (Run & { readonly status: 'Won' | 'Lost'; readonly endedAt: Tick });

export type RunCommand =
  | { kind: 'PlayerDowned'; player: PlayerId; tick: Tick }
  | { kind: 'BossCleared'; boss: BossId; tick: Tick }
  | { kind: 'TunnelEntered'; player: PlayerId; loadout: Loadout; tick: Tick }
  | { kind: 'RewardChosen'; player: PlayerId; option: number; tick: Tick };

export type RunEvent =
  | { kind: 'RunLost'; player: PlayerId; tick: Tick }
  | { kind: 'ArenaCleared'; arena: number; tick: Tick }
  | { kind: 'RunWon'; boss: BossId; tick: Tick }
  | { kind: 'ArenaEntered'; arena: number; loadout: Loadout; tick: Tick }
  | { kind: 'TunnelRefused'; reason: 'NotCleared' | 'LastArena'; tick: Tick }
  | { kind: 'PlayerRevived'; player: PlayerId; revivesLeft: number; tick: Tick }
  | { kind: 'RewardsOffered'; arena: number; options: readonly Reward[]; tick: Tick }
  | { kind: 'RewardTaken'; reward: Reward; tick: Tick };

export const STARTING_LOADOUT: Loadout = {
  hp: 100,
  weapon: { id: 'w-start' as WeaponId, kind: 'gun', durability: 0, ammo: 16 },
  perks: [],
  armor: 0,
};

export function initialRun(arenas: number, seed = 1): RunState {
  if (!Number.isInteger(arenas) || arenas < 1) throw new RangeError(`a run needs at least one arena, not ${arenas}`);
  return { arena: 1, arenas, status: 'Fighting', loadout: STARTING_LOADOUT, seed, revives: STARTING_REVIVES, offer: null };
}

const run = (s: RunState): Run => ({
  arena: s.arena, arenas: s.arenas, loadout: s.loadout, seed: s.seed, revives: s.revives, offer: s.offer,
});

// A small seeded generator (mulberry32): the same seed and arena always give the
// same offer, and the rules stay pure.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Three different rewards for clearing this arena. A revive is left out when
// you couldn't hold another.
export function offerFor(seed: number, arena: number, revives: number): readonly Reward[] {
  const next = seeded(seed * 1009 + arena);
  const pool = REWARD_POOL.filter((r) => r !== 'revive' || revives < MAX_REVIVES);
  const picked: Reward[] = [];
  while (picked.length < OFFER_SIZE && pool.length > 0) picked.push(...pool.splice(Math.floor(next() * pool.length), 1));
  return picked;
}

export function decide(cmd: RunCommand, s: RunState): readonly RunEvent[] {
  switch (cmd.kind) {
    case 'PlayerDowned': {
      // Only while the run is still going: in a fight, in a cleared arena, or on
      // the very tick of the win (a trade). Afterwards, the outcome stands.
      const going = s.status === 'Fighting' || s.status === 'Cleared' || (s.status === 'Won' && s.endedAt === cmd.tick);
      if (!going) return NO_EVENTS;
      // A revive gets you back up where you fell; a trade on the winning tick
      // spends one and the win stands. With none left, if we die, we die, in
      // whichever order the simulation reported the two deaths.
      return s.revives > 0
        ? [{ kind: 'PlayerRevived', player: cmd.player, revivesLeft: s.revives - 1, tick: cmd.tick }]
        : [{ kind: 'RunLost', player: cmd.player, tick: cmd.tick }];
    }
    case 'BossCleared':
      if (s.status !== 'Fighting') return NO_EVENTS;
      return s.arena < s.arenas
        ? [
          { kind: 'ArenaCleared', arena: s.arena, tick: cmd.tick },
          { kind: 'RewardsOffered', arena: s.arena, options: offerFor(s.seed, s.arena, s.revives), tick: cmd.tick },
        ]
        : [{ kind: 'RunWon', boss: cmd.boss, tick: cmd.tick }];
    case 'TunnelEntered':
      // Refused rather than ignored, so whatever is waiting on the answer is released.
      if (s.status !== 'Cleared') return [{ kind: 'TunnelRefused', reason: 'NotCleared', tick: cmd.tick }];
      if (s.arena >= s.arenas) return [{ kind: 'TunnelRefused', reason: 'LastArena', tick: cmd.tick }];
      // The rule for what carries over: your hp as it stands, the weapon in your hands, and your perks.
      return [{ kind: 'ArenaEntered', arena: s.arena + 1, loadout: cmd.loadout, tick: cmd.tick }];
    case 'RewardChosen':
      // One pick per offer; a second touch, or a choice with nothing on offer, is already answered.
      if (s.status !== 'Cleared' || !s.offer || cmd.option < 0 || cmd.option >= s.offer.length) return NO_EVENTS;
      return [{ kind: 'RewardTaken', reward: s.offer[cmd.option], tick: cmd.tick }];
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
      // An offer not taken before the tunnel is left behind.
      return { ...run(s), arena: e.arena, status: 'Fighting', loadout: e.loadout, offer: null };
    case 'TunnelRefused': return s;
    case 'PlayerRevived': return { ...s, revives: e.revivesLeft };
    case 'RewardsOffered': return { ...s, offer: e.options };
    case 'RewardTaken':
      return { ...s, offer: null, revives: e.reward === 'revive' ? Math.min(MAX_REVIVES, s.revives + 1) : s.revives };
    default: return assertNever(e);
  }
}
