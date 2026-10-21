// The fairness limits, checked against every generated move for hundreds of
// seeds, three bodies and every depth a run can reach. Each check works the
// numbers out from the player's own speed and dodge, not from the generator's
// ranges, so a generator change that breaks a limit fails here.
import { describe, expect, it } from 'vitest';
import { inSeconds, ticks } from '../core/units';
import { JUMP_AIR } from '../systems/boss-actions';
import { AIMED_SPEED, BURST_SPEED } from '../systems/boss-scripts';
import { BULLET_RADIUS } from '../systems/combat';
import { DODGE_SPEED, DODGE_TICKS, PLAYER_SPEED } from '../systems/motion';
import { BODY_DEFS } from './defs';
import {
  Body, DENSITY_CAP, MAX_ORBS, MIN_TELEGRAPH, planFor, type BodyKind, type BossPlan, type Move, type RingDef, type SpiralDef,
} from './generate';

const PLAYER_RADIUS = 0.45;
const BODIES: readonly BodyKind[] = [Body.Colossus, Body.Lancer, Body.Sentinel];
const KITS = 300;
const DEPTHS = [1, 2, 3, 5, 8];
// The deepest pace a run reaches (8 arenas deep), and how much it speeds bullets: half its growth.
const MAX_PACE = 1 + 0.08 * 8;
const bulletSpeedAt = (speed: number) => speed * (1 + (MAX_PACE - 1) / 2);
const seconds = (t: number) => inSeconds(ticks(t));

function* everyPlan(): Generator<{ plan: BossPlan; body: BodyKind; depth: number; kit: number }> {
  for (const body of BODIES) for (const depth of DEPTHS) for (let kit = 1; kit <= KITS; kit++) {
    yield { plan: planFor(kit, depth, body), body, depth, kit };
  }
}

function* everyMove(): Generator<{ move: Move; body: BodyKind }> {
  for (const { plan, body } of everyPlan()) for (const phase of plan.phases) for (const move of phase.moves) yield { move, body };
}

// Closest a player can stand to the boss: touching it.
const contact = (body: BodyKind) => BODY_DEFS[body].radius + PLAYER_RADIUS;

// The fastest way to cover a distance: a dodge first, then walking.
function escapeSeconds(distance: number): number {
  const dodge = DODGE_SPEED * seconds(DODGE_TICKS);
  return distance <= dodge ? distance / DODGE_SPEED : seconds(DODGE_TICKS) + (distance - dodge) / PLAYER_SPEED;
}

// Ticks from the start of an action to the first moment it can hurt someone
// touching the boss: the windup, plus a bullet's flight to them.
function telegraph(move: Move, body: BodyKind): number {
  const fly = (speed: number) => (contact(body) / bulletSpeedAt(speed)) * 60;
  switch (move.kind) {
    case 'slam': return move.windup;
    case 'jump': return JUMP_AIR; // the landing spot shows at take-off
    case 'cone': return move.windup + fly(AIMED_SPEED);
    case 'burst': return move.windup + fly(BURST_SPEED);
    case 'ring': return move.ring.windup + fly(move.ring.speed);
    case 'spiral': return move.spiral.windup + fly(move.spiral.speed);
    case 'charge': return move.windup;
    case 'sweep': return move.windup;
    case 'orbs': return move.orbs.windup + fly(move.orbs.speed);
    case 'combo': return Math.min(move.ring.windup, move.spiral.windup) + fly(Math.max(move.ring.speed, move.spiral.speed));
  }
}

// Bullets a wave leaves out of a ring, counted the way the script fires them.
function ringWave(ring: RingDef): number {
  let n = 0;
  for (let i = 0; i < ring.bullets; i++) {
    const a = (i / ring.bullets) * Math.PI * 2;
    let inGap = false;
    for (let k = 0; k < ring.gaps; k++) {
      const gap = (k * 2 * Math.PI) / ring.gaps;
      if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < ring.gapHalf) inGap = true;
    }
    if (!inGap) n++;
  }
  return n;
}
const ringRate = (ring: RingDef) => ringWave(ring) * (60 / ring.waveGap);
const spiralRate = (spiral: SpiralDef) => spiral.arms * (60 / spiral.every);

function density(move: Move): number {
  switch (move.kind) {
    case 'cone': return move.count * Math.min(move.volleys, 5); // volleys 12 ticks apart: all inside one second
    case 'burst': return move.count;
    case 'ring': return ringRate(move.ring);
    case 'spiral': return spiralRate(move.spiral);
    case 'orbs': return move.orbs.count;
    case 'combo': return ringRate(move.ring) + spiralRate(move.spiral);
    default: return 0;
  }
}

// The gap ring's rule (patterns.test): at 6 m, every wave still in the air
// when the next goes out shares a spot wide enough for a player and a bullet
// either side.
function sharedGap(ring: RingDef): number {
  const flight = (6 / bulletSpeedAt(ring.speed)) * 60;
  const inAir = Math.ceil(flight / ring.waveGap) + 1;
  return (2 * ring.gapHalf - (inAir - 1) * ring.turn) * 6;
}

describe('procedural bosses', () => {
  it('are the same boss for the same kit, body and depth', () => {
    for (const body of BODIES) expect(planFor(42, 4, body)).toEqual(planFor(42, 4, body));
  });

  it('differ from seed to seed', () => {
    for (const body of BODIES) {
      const kits = new Set<string>();
      for (let kit = 1; kit <= 200; kit++) kits.add(planFor(kit, 4, body).phases.map((p) => p.moves.map((m) => m.kind).join()).join('|'));
      expect(kits.size).toBeGreaterThan(20);
    }
  });

  it('always fight with their body\'s signature, and add a move each phase', () => {
    const signature = { [Body.Colossus]: 'slam', [Body.Lancer]: 'charge', [Body.Sentinel]: 'sweep' } as const;
    for (const { plan, body } of everyPlan()) {
      expect(plan.phases[0].moves.map((m) => m.kind)).toContain(signature[body]);
      for (let i = 1; i < plan.phases.length; i++) expect(plan.phases[i].moves.length).toBeGreaterThan(plan.phases[i - 1].moves.length);
      expect(plan.phaseAt.length).toBe(plan.phases.length - 1);
    }
  });

  it('have two phases early and three from depth 3, ending on a combo', () => {
    for (const { plan, depth } of everyPlan()) {
      expect(plan.phases.length).toBe(depth >= 3 ? 3 : 2);
      const last = plan.phases[plan.phases.length - 1].moves;
      expect(last.some((m) => m.kind === 'combo')).toBe(depth >= 3);
    }
  });

  it('a Sentinel never draws a move its body cannot make (slam, jump, charge)', () => {
    for (const { plan, body } of everyPlan()) {
      if (body !== Body.Sentinel) continue;
      for (const phase of plan.phases) for (const m of phase.moves) expect(['slam', 'jump', 'charge']).not.toContain(m.kind);
    }
  });
});

describe('fairness: every attack is escapable', () => {
  it('telegraphs for at least the minimum before anything can land', () => {
    for (const { move, body } of everyMove()) expect(telegraph(move, body), move.kind).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
  });

  it('a slam can be left from touching distance, dodging then walking, before it lands', () => {
    for (const { move, body } of everyMove()) {
      if (move.kind !== 'slam') continue;
      const out = move.radius + PLAYER_RADIUS - contact(body);
      expect(escapeSeconds(out)).toBeLessThanOrEqual(seconds(move.windup));
    }
  });

  it('a charge can be sidestepped on foot inside its windup', () => {
    for (const { move } of everyMove()) {
      if (move.kind !== 'charge') continue;
      expect((move.width / 2 + PLAYER_RADIUS) / PLAYER_SPEED).toBeLessThanOrEqual(seconds(move.windup));
    }
  });

  it('a beam sweep leaves a wedge it never touches, and can be dodged through after stepping back during its telegraph', () => {
    for (const { move, body } of everyMove()) {
      if (move.kind !== 'sweep') continue;
      expect(move.arc).toBeLessThanOrEqual(Math.PI * 1.5);
      // Far enough out, the beam passes a player faster than a dodge lasts...
      const passing = move.width + 2 * PLAYER_RADIUS;
      const dodgeFrom = passing / (move.turnRate * seconds(DODGE_TICKS));
      // ...and that far out can be reached on foot from touching distance during the telegraph.
      expect(Math.max(0, dodgeFrom - contact(body)) / PLAYER_SPEED).toBeLessThanOrEqual(seconds(move.windup));
    }
  });

  it('homing orbs are slower than a walking player, so they can always be outrun', () => {
    for (const { move } of everyMove()) {
      if (move.kind !== 'orbs') continue;
      expect(bulletSpeedAt(move.orbs.speed)).toBeLessThan(PLAYER_SPEED * 0.9);
      expect(move.orbs.count).toBeLessThanOrEqual(MAX_ORBS);
    }
  });

  it('rings, alone or in a combo, always leave one safe spot shared by every wave in the air', () => {
    for (const { move } of everyMove()) {
      const ring = move.kind === 'ring' ? move.ring : move.kind === 'combo' ? move.ring : null;
      if (!ring) continue;
      expect(sharedGap(ring)).toBeGreaterThan(2 * (PLAYER_RADIUS + BULLET_RADIUS));
    }
  });

  it('a spiral\'s lanes are wide enough to stand in and slow enough to walk with, 6 m out', () => {
    for (const { move } of everyMove()) {
      const spiral = move.kind === 'spiral' ? move.spiral : move.kind === 'combo' ? move.spiral : null;
      if (!spiral) continue;
      const lane = ((2 * Math.PI) / spiral.arms) * 6;
      expect(lane).toBeGreaterThan(2 * (PLAYER_RADIUS + BULLET_RADIUS));
      const laneSpeed = (spiral.step / seconds(spiral.every)) * 6;
      expect(laneSpeed).toBeLessThan(PLAYER_SPEED);
    }
  });

  it('never fires more bullets a second than the cap, a combo counting both its parts', () => {
    for (const { move } of everyMove()) expect(density(move), move.kind).toBeLessThanOrEqual(DENSITY_CAP);
  });
});
