// Procedural bosses (Stage C): a boss's moves, phase by phase, generated from a
// seed and the arena's depth. Pure data, so the same kit and depth always give
// the same boss, a load rebuilds it from two numbers, and the fairness limits
// below can be checked across hundreds of seeds without running a fight.
//
// Decided with the user:
// - "Unfair" means unescapable. Every attack can be escaped by walking or one
//   dodge, after a telegraph of at least MIN_TELEGRAPH; rings always leave a
//   shared safe spot; bullets per second stay under a cap.
// - Each boss gets its own kit per phase with its own settings; its last
//   phase may fuse two patterns into one action, like the Keeper's storm.
// - The Lancer's charge and the Sentinel's beam sweep and homing orbs are
//   building blocks; a body only weights which moves its kit draws.
import { hashDraw } from '../core/rng';
import { hp, inTicks, meters, seconds, ticks, type Hp, type Meters, type Seconds, type Ticks } from '../core/units';

export const Body = { Colossus: 0, Lancer: 1, Sentinel: 2 } as const;
export type BodyKind = (typeof Body)[keyof typeof Body];

// The fairness limits. Tests check every generated move against them, and
// against the player's own speed and dodge, across hundreds of kits.
export const MIN_TELEGRAPH = ticks(24);
// Bullets a second, at most, from one action: the Keeper's storm, the hardest
// pattern players have already accepted.
export const DENSITY_CAP = 115;
export const MAX_ORBS = 6;

export type RingDef = {
  readonly waves: number; readonly gaps: number; readonly gapHalf: number; readonly turn: number;
  readonly speed: number; readonly waveGap: Ticks; readonly windup: Ticks; readonly bullets: number;
};
export type SpiralDef = {
  readonly arms: number; readonly step: number; readonly every: Ticks; readonly speed: number;
  readonly length: Ticks; readonly windup: Ticks;
};
export type OrbsDef = {
  readonly count: number; readonly speed: number; readonly turn: number; readonly life: Seconds; readonly windup: Ticks;
};

export type Move =
  | { readonly kind: 'slam'; readonly windup: Ticks; readonly radius: Meters; readonly dmg: Hp }
  | { readonly kind: 'jump' }
  | { readonly kind: 'cone'; readonly windup: Ticks; readonly volleys: number; readonly count: number; readonly spread: number }
  | { readonly kind: 'burst'; readonly windup: Ticks; readonly count: number }
  | { readonly kind: 'ring'; readonly ring: RingDef }
  | { readonly kind: 'spiral'; readonly spiral: SpiralDef }
  | {
    readonly kind: 'charge'; readonly windup: Ticks; readonly speed: number; readonly length: Meters;
    readonly width: Meters; readonly dmg: Hp; readonly stun: Ticks;
  }
  | {
    readonly kind: 'sweep'; readonly windup: Ticks; readonly arc: number; readonly turnRate: number;
    readonly width: Meters; readonly dmg: Hp;
  }
  | { readonly kind: 'orbs'; readonly orbs: OrbsDef }
  // Two patterns as one action, like the storm: spiral arms turning while rings go out through them.
  | { readonly kind: 'combo'; readonly ring: RingDef; readonly spiral: SpiralDef; readonly length: Ticks };
export type MoveKind = Move['kind'];

export type PhaseKit = { readonly moves: readonly Move[] };
export type BossPlan = {
  readonly name: string; readonly body: BodyKind;
  readonly phases: readonly PhaseKit[];
  // Shares of max hp at which each next phase starts, in order.
  readonly phaseAt: readonly number[];
};

const BODY_NAMES = ['The Colossus', 'The Lancer', 'The Sentinel'] as const;
const EPITHETS = ['Ashen', 'Hollow', 'Gilded', 'Restless', 'Pale', 'Iron', 'Unwound', 'Thrice-Bound', 'Glass', 'Sleepless'];

// What a body leans on: weights per move, and the move every one of its kits has.
const WEIGHTS: Record<BodyKind, Partial<Record<MoveKind, number>>> = {
  [Body.Colossus]: { slam: 3, jump: 3, cone: 2, burst: 2, ring: 1, spiral: 1, orbs: 1 },
  [Body.Lancer]: { charge: 4, cone: 2, jump: 2, burst: 1, ring: 1, spiral: 1 },
  [Body.Sentinel]: { sweep: 4, orbs: 3, ring: 2, spiral: 2, burst: 2, cone: 1 },
};
const SIGNATURE: Record<BodyKind, MoveKind> = { [Body.Colossus]: 'slam', [Body.Lancer]: 'charge', [Body.Sentinel]: 'sweep' };

// A stream of seeded numbers in [0, 1) from the kit, without touching the drop RNG.
function draws(kit: number): () => number {
  let n = 0;
  return () => hashDraw(kit, 7919 + n++);
}

const between = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();
const whole = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
// How far into the run, 0..1: deeper bosses use the harder end of each range.
const depthShare = (depth: number) => Math.min(1, Math.max(0, (depth - 1) / 7));

function ringDef(r: () => number, deep: number): RingDef {
  const gaps = whole(r, 2, 4);
  const gapHalf = [0.27, 0.3, 0.34][whole(r, 0, 2)];
  const speed = between(r, 8, 10);
  const waveGap = ticks(whole(r, 24, 30));
  // A wave still flies when the next goes out, so every wave in the air at once
  // must share a safe spot (the gap ring's rule): the gaps turn less than
  // their width allows. Kept well inside it, with room for a player and bullets.
  const inAir = Math.ceil(inTicks(seconds(6 / speed)) / waveGap) + 1;
  const room = (2 * (0.45 + 0.2)) / 6 + 0.05;
  const maxTurn = (2 * gapHalf - room) / (inAir - 1);
  const turn = Math.min(maxTurn, between(r, 0.08, 0.16));
  return {
    waves: whole(r, 2, 3) + Math.round(deep * 2), gaps, gapHalf, turn, speed, waveGap,
    windup: ticks(whole(r, 30, 36)), bullets: 48,
  };
}

function spiralDef(r: () => number, deep: number): SpiralDef {
  return {
    arms: whole(r, 2, 4),
    // Slow enough to walk round with a lane: at 6 m out a lane moves at most
    // ~5 m/s, under the player's walking speed (the Unchained's spiral is 5.4).
    step: between(r, 0.03, 0.055),
    every: ticks(4),
    speed: between(r, 9, 11),
    length: ticks(Math.round(between(r, 100, 130) + deep * 40)),
    windup: ticks(whole(r, 24, 30)),
  };
}

function makeMove(kind: MoveKind, r: () => number, depth: number): Move {
  const deep = depthShare(depth);
  switch (kind) {
    case 'slam': {
      const big = r() < 0.5 + deep / 2;
      return { kind, windup: ticks(big ? 32 : 42), radius: meters(big ? 5.5 : 4.5), dmg: hp(30) };
    }
    case 'jump': return { kind };
    case 'cone':
      return { kind, windup: ticks(whole(r, 20, 24)), volleys: whole(r, 1, 3), count: whole(r, 3, 7), spread: between(r, 0.14, 0.22) };
    case 'burst': return { kind, windup: ticks(whole(r, 18, 22)), count: whole(r, 14, 20) };
    case 'ring': return { kind, ring: ringDef(r, deep) };
    case 'spiral': return { kind, spiral: spiralDef(r, deep) };
    case 'charge':
      return {
        kind, windup: ticks(Math.round(between(r, 34, 42) - deep * 6)), speed: between(r, 16, 20) + deep * 4,
        length: meters(between(r, 14, 22)), width: meters(1.6), dmg: hp(25), stun: ticks(whole(r, 70, 100)),
      };
    case 'sweep':
      return {
        kind, windup: ticks(whole(r, 36, 44)), arc: between(r, Math.PI * 0.6, Math.PI * 1.4),
        turnRate: between(r, 1.6, 2.4) + deep * 0.6, width: meters(0.7), dmg: hp(20),
      };
    case 'orbs':
      return {
        kind,
        orbs: {
          count: Math.min(MAX_ORBS, whole(r, 2, 4) + Math.round(deep * 2)), speed: between(r, 3.2, 4.0),
          turn: between(r, 1.2, 1.8), life: seconds(between(r, 4, 5.5)), windup: ticks(whole(r, 24, 30)),
        },
      };
    case 'combo': {
      // The storm's own rhythm: its two parts share the action, so each is a
      // little lighter than alone, and the density cap holds for the sum.
      const ring = { ...ringDef(r, deep), bullets: 40, waveGap: ticks(whole(r, 26, 30)) };
      const spiral = { ...spiralDef(r, deep), arms: 2 };
      return { kind, ring, spiral, length: ticks(Math.round(between(r, 130, 160) + deep * 30)) };
    }
    default: return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled move kind ${String(x)}`);
}

// Draws one move kind by the body's weights, from those not already in the kit.
function drawKind(r: () => number, body: BodyKind, taken: ReadonlySet<MoveKind>): MoveKind {
  const options = (Object.entries(WEIGHTS[body]) as [MoveKind, number][]).filter(([kind]) => !taken.has(kind));
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let pick = r() * total;
  for (const [kind, weight] of options) {
    pick -= weight;
    if (pick < 0) return kind;
  }
  return options[options.length - 1][0];
}

// The boss for this kit (a seed), body and depth. Phase 1 opens with the
// body's signature and one or two more; each phase after keeps what came
// before and adds a move; three-phase bosses (from depth 3) end on a combo.
export function planFor(kit: number, depth: number, body: BodyKind): BossPlan {
  const r = draws(kit * 31 + body);
  const phaseCount = depth >= 3 ? 3 : 2;
  const taken = new Set<MoveKind>([SIGNATURE[body]]);
  let kinds: MoveKind[] = [SIGNATURE[body]];
  const extra = whole(r, 1, 2);
  for (let i = 0; i < extra; i++) {
    const kind = drawKind(r, body, taken);
    taken.add(kind);
    kinds.push(kind);
  }
  const phases: PhaseKit[] = [];
  for (let phase = 1; phase <= phaseCount; phase++) {
    if (phase > 1) {
      const kind = drawKind(r, body, taken);
      taken.add(kind);
      kinds = [...kinds, kind];
    }
    const moves = kinds.map((kind) => makeMove(kind, r, depth));
    if (phase === 3) moves.push(makeMove('combo', r, depth));
    phases.push({ moves });
  }
  return {
    name: `${BODY_NAMES[body]}, ${EPITHETS[Math.floor(hashDraw(kit, 17) * EPITHETS.length)]}`,
    body,
    phases,
    phaseAt: phaseAtFor(phaseCount),
  };
}

// The shares of max hp each next phase starts at, by how many phases a plan has:
// the Keeper's thirds for three, the Warden's half for two.
export function phaseAtFor(phases: number): readonly number[] {
  return phases >= 3 ? [0.66, 0.33] : [0.5];
}

// Bullets a second while a pattern is firing, as the generator sees them.
// Only patterns that fire bullets count; the tests work this out on their own.
export function ringBulletsPerWave(ring: RingDef): number {
  const step = (2 * Math.PI) / ring.bullets;
  return ring.bullets - ring.gaps * Math.ceil((2 * ring.gapHalf) / step);
}
