import { assertNever, NO_EVENTS, type BossId, type PlayerId, type Tick, type WeaponId } from '../shared/types';

// A run is a sequence of arenas: the Warden, bosses drawn from the pool, and the
// final. Which arena you're in, whether it's cleared, which doors a clear opens
// and what you carry between them are rules other parts depend on: a door can
// be refused, the loadout carries over, the run is won or lost.
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

// The fork, Hades-style: a clear opens the onward door, and once you're strong
// enough a second one, to the final. At the most drawn bosses, the final is the
// only way on. Experimental numbers (rules table, R17).
export const MIN_DRAWN = 3;
export const MAX_DRAWN = 7;
export const FINAL_POWER = 5.5;
// The Warden, the drawn bosses, the final.
export const MAX_ARENAS = MAX_DRAWN + 2;
export type Door = 'onward' | 'final';
export type Doors = 'onward' | 'both' | 'final';

// How strong you are, as the run judges it. Never shown and never in an event:
// you only see a door open. Each thing you carry adds; a weapon in hand counts
// as one, until weapons have levels.
export function powerOf(loadout: Loadout, revives: number): number {
  return loadout.hp / 100 + 0.5 * revives + 0.4 * loadout.armor + 0.6 * loadout.perks.length + (loadout.weapon ? 1 : 0);
}

// Which doors clearing arena `arena` opens. Drawn bosses cleared so far is
// arena - 1, the Warden being arena 1.
function doorsAfter(arena: number, loadout: Loadout, revives: number): Doors {
  const drawn = arena - 1;
  if (drawn >= MAX_DRAWN) return 'final';
  return drawn >= MIN_DRAWN && powerOf(loadout, revives) >= FINAL_POWER ? 'both' : 'onward';
}

const opens = (doors: Doors, door: Door): boolean => doors === 'both' || doors === door;

type Run = {
  readonly arena: number; // 1-based, never past MAX_ARENAS
  // Whether this arena is the final boss's: clearing it wins the run.
  readonly final: boolean;
  readonly loadout: Loadout; // what the current arena was entered with
  // Draws everything the run decides by chance, so a seed replays the run.
  readonly seed: number;
  readonly revives: number;
  // Three rewards to pick one from, after a clear; null when there's nothing to pick.
  // Only a cleared arena ever has one (RewardsOffered follows ArenaCleared, and
  // ArenaEntered clears it), but every status can hold the field: making it
  // Cleared-only would split every state type for a combination nothing produces.
  readonly offer: readonly Reward[] | null;
  // The doors a clear opened; null until then. Same reasoning as the offer for
  // not splitting the state type.
  readonly doors: Doors | null;
};
// Only a finished run has an end tick, so "won, but when?" can't be written down.
export type RunState =
  | (Run & { readonly status: 'Fighting' | 'Cleared' })
  | (Run & { readonly status: 'Won' | 'Lost'; readonly endedAt: Tick });

export type RunCommand =
  | { kind: 'PlayerDowned'; player: PlayerId; tick: Tick }
  // loadout: what you have on you at the kill, which decides the doors; null when
  // you're down on that tick, and the run goes by what you entered with.
  | { kind: 'BossCleared'; boss: BossId; loadout: Loadout | null; tick: Tick }
  | { kind: 'TunnelEntered'; player: PlayerId; door: Door; loadout: Loadout; tick: Tick }
  | { kind: 'RewardChosen'; player: PlayerId; option: number; tick: Tick };

export type RunEvent =
  | { kind: 'RunLost'; player: PlayerId; tick: Tick }
  | { kind: 'ArenaCleared'; arena: number; doors: Doors; tick: Tick }
  | { kind: 'RunWon'; boss: BossId; tick: Tick }
  | { kind: 'ArenaEntered'; arena: number; final: boolean; loadout: Loadout; tick: Tick }
  | { kind: 'TunnelRefused'; reason: 'NotCleared' | 'DoorClosed'; tick: Tick }
  | { kind: 'PlayerRevived'; player: PlayerId; revivesLeft: number; tick: Tick }
  | { kind: 'RewardsOffered'; arena: number; options: readonly Reward[]; tick: Tick }
  // revives: the count after taking it, so whoever shows it needn't read the state.
  | { kind: 'RewardTaken'; reward: Reward; revives: number; tick: Tick }
  | { kind: 'RewardRefused'; reason: 'NoOffer' | 'NoSuchOption'; tick: Tick };

export const STARTING_LOADOUT: Loadout = {
  hp: 100,
  weapon: { id: 'w-start' as WeaponId, kind: 'gun', durability: 0, ammo: 16 },
  perks: [],
  armor: 0,
};

export function initialRun(seed = 1): RunState {
  return {
    arena: 1, final: false, status: 'Fighting', loadout: STARTING_LOADOUT, seed, revives: STARTING_REVIVES, offer: null, doors: null,
  };
}

const run = (s: RunState): Run => ({
  arena: s.arena, final: s.final, loadout: s.loadout, seed: s.seed, revives: s.revives, offer: s.offer, doors: s.doors,
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
      if (s.final) return [{ kind: 'RunWon', boss: cmd.boss, tick: cmd.tick }];
      return [
        { kind: 'ArenaCleared', arena: s.arena, doors: doorsAfter(s.arena, cmd.loadout ?? s.loadout, s.revives), tick: cmd.tick },
        { kind: 'RewardsOffered', arena: s.arena, options: offerFor(s.seed, s.arena, s.revives), tick: cmd.tick },
      ];
    case 'TunnelEntered':
      // Refused rather than ignored, so whatever is waiting on the answer is released.
      if (s.status !== 'Cleared') return [{ kind: 'TunnelRefused', reason: 'NotCleared', tick: cmd.tick }];
      if (!s.doors || !opens(s.doors, cmd.door)) return [{ kind: 'TunnelRefused', reason: 'DoorClosed', tick: cmd.tick }];
      // The rule for what carries over: your hp as it stands, the weapon in your hands, and your perks.
      return [{ kind: 'ArenaEntered', arena: s.arena + 1, final: cmd.door === 'final', loadout: cmd.loadout, tick: cmd.tick }];
    case 'RewardChosen':
      // One pick per offer. Anything else is refused rather than ignored, like the
      // tunnel, so whatever is waiting on the answer is released.
      if (s.status !== 'Cleared' || !s.offer) return [{ kind: 'RewardRefused', reason: 'NoOffer', tick: cmd.tick }];
      if (!Number.isInteger(cmd.option) || cmd.option < 0 || cmd.option >= s.offer.length) {
        return [{ kind: 'RewardRefused', reason: 'NoSuchOption', tick: cmd.tick }];
      }
      const reward = s.offer[cmd.option];
      const revives = reward === 'revive' ? Math.min(MAX_REVIVES, s.revives + 1) : s.revives;
      return [{ kind: 'RewardTaken', reward, revives, tick: cmd.tick }];
    default:
      return assertNever(cmd);
  }
}

export function evolve(s: RunState, e: RunEvent): RunState {
  switch (e.kind) {
    case 'RunLost': return { ...run(s), status: 'Lost', endedAt: e.tick };
    case 'ArenaCleared': return { ...run(s), status: 'Cleared', doors: e.doors };
    case 'RunWon': return { ...run(s), status: 'Won', endedAt: e.tick };
    case 'ArenaEntered':
      // decide never asks for this; a fact past the last arena means a bug upstream.
      if (e.arena > MAX_ARENAS) throw new RangeError(`arena ${e.arena} of at most ${MAX_ARENAS}`);
      // An offer not taken before the tunnel is left behind.
      return { ...run(s), arena: e.arena, final: e.final, status: 'Fighting', loadout: e.loadout, offer: null, doors: null };
    case 'TunnelRefused': return s;
    case 'PlayerRevived': return { ...s, revives: e.revivesLeft };
    case 'RewardsOffered': return { ...s, offer: e.options };
    case 'RewardTaken': return { ...s, offer: null, revives: e.revives };
    case 'RewardRefused': return s;
    default: return assertNever(e);
  }
}
