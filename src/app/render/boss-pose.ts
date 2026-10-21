// How the boss looks during each action, as a pure function of the action and
// how far into it we are. The simulation only stores which action and since
// when, so animation can be tuned here without touching gameplay.
import {
  Action, BURST_WINDUP, CONE_VOLLEY_GAP, CONE_WINDUP, JUMP_AIR, JUMP_CROUCH, JUMP_RECOVER, RING_WAVE_GAP, RING_WINDUP,
  ROAR_HOLD, ROAR_REAR, SPIRAL_WINDUP, STORM_WINDUP,
} from '../../ecs/systems/boss-actions';

export type Pose = { height: number; sx: number; sy: number; lean: number };

const REST: Pose = { height: 0, sx: 1, sy: 1, lean: 0 };
const JUMP_PEAK = 4.5;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// elapsed: ticks since the action began, fractional (interpolated between ticks).
// slamWindup: 0..1 through a slam's telegraph, which drives its own squash.
// fromHeight: where a jump starts, when it isn't the ground (a perch).
// windup: the action's own telegraph in ticks, for generated moves; 0 means the hand-made one.
// stunned: a charge that ran into stone.
export function bossPose(
  kind: number, elapsed: number, slamWindup: number, fromHeight = 0, windup = 0, stunned = false,
): Pose {
  switch (kind) {
    case Action.Jump: {
      if (elapsed < JUMP_CROUCH) {
        // Crouch: the tell that it's about to leave the ground (or its perch).
        const c = ease(clamp01(elapsed / JUMP_CROUCH));
        return { height: fromHeight, sx: 1 + 0.18 * c, sy: 1 - 0.3 * c, lean: 0 };
      }
      const air = elapsed - JUMP_CROUCH;
      if (air < JUMP_AIR) {
        const t = air / JUMP_AIR;
        // Stretched on the way up and down, round at the top. From a perch it
        // hops a little, then falls the rest of the way.
        const stretch = 0.15 * Math.abs(1 - 2 * t);
        const peak = fromHeight > 0 ? 1.6 : JUMP_PEAK;
        const height = fromHeight * (1 - t) + 4 * peak * t * (1 - t);
        return { height, sx: 1 - stretch * 0.5, sy: 1 + stretch, lean: 0 };
      }
      const r = clamp01((air - JUMP_AIR) / JUMP_RECOVER);
      return { height: 0, sx: 1 + 0.25 * (1 - r), sy: 1 - 0.35 * (1 - r), lean: 0 };
    }
    case Action.Cone: {
      const w = windup || CONE_WINDUP;
      if (elapsed < w) {
        // Rears back while the cone telegraph fills.
        return { ...REST, lean: -0.3 * ease(clamp01(elapsed / w)) };
      }
      // A recoil kick on every volley, settling between them.
      const since = (elapsed - w) % CONE_VOLLEY_GAP;
      return { ...REST, lean: 0.22 * Math.exp(-since * 0.35) };
    }
    case Action.Burst:
    case Action.Orbs: {
      const full = windup || BURST_WINDUP;
      const w = clamp01(elapsed / full);
      // Swells, then snaps back as the ring (or the orbs) go out.
      const puff = elapsed < full ? 0.18 * ease(w) : 0.18 * Math.exp(-(elapsed - full) * 0.5);
      return { height: 0, sx: 1 + puff, sy: 1 + puff, lean: 0 };
    }
    case Action.Roar: {
      if (elapsed < ROAR_REAR) {
        // Rears back and draws itself up.
        const r = ease(clamp01(elapsed / ROAR_REAR));
        return { height: 0, sx: 1 - 0.06 * r, sy: 1 + 0.15 * r, lean: -0.4 * r };
      }
      // Lunges forward into the roar and trembles, settling as it ends.
      const t = elapsed - ROAR_REAR;
      const settle = 1 - clamp01(t / ROAR_HOLD);
      const tremble = Math.sin(t * 2.6) * 0.05 * settle;
      return { height: 0, sx: 1 + 0.08 * settle + tremble, sy: 1 + 0.08 * settle - tremble, lean: 0.25 * settle };
    }
    case Action.Ring: {
      const w = windup || RING_WINDUP;
      if (elapsed < w) {
        // Hunkers down while the floor shows where the gaps will be.
        const c = ease(clamp01(elapsed / w));
        return { height: 0, sx: 1 + 0.12 * c, sy: 1 - 0.16 * c, lean: 0 };
      }
      // A puff on every wave, like the burst, settling before the next.
      const since = (elapsed - w) % RING_WAVE_GAP;
      const puff = 0.2 * Math.exp(-since * 0.3);
      return { height: 0, sx: 1 + puff, sy: 1 + puff * 0.5, lean: 0 };
    }
    case Action.Spiral: {
      const w = windup || SPIRAL_WINDUP;
      if (elapsed < w) {
        const r = ease(clamp01(elapsed / w));
        return { height: 0, sx: 1, sy: 1 + 0.1 * r, lean: -0.2 * r };
      }
      // A steady shudder while the arms pour out.
      const t = elapsed - w;
      return { height: 0, sx: 1 + Math.sin(t * 1.3) * 0.04, sy: 1.08, lean: 0.08 };
    }
    case Action.Storm:
    case Action.Combo: {
      const w = windup || STORM_WINDUP;
      if (elapsed < w) {
        // Draws itself up taller than for any other attack: the tell for the big one.
        const r = ease(clamp01(elapsed / w));
        return { height: 0.4 * r, sx: 1 - 0.05 * r, sy: 1 + 0.2 * r, lean: -0.25 * r };
      }
      const t = elapsed - w;
      return { height: 0.4, sx: 1 + Math.sin(t * 1.7) * 0.05, sy: 1.15, lean: 0.06 * Math.sin(t * 0.9) };
    }
    case Action.Charge: {
      if (stunned) {
        // Reeling from the pillar: a wobble that says "hit me now".
        return { height: 0, sx: 1 + Math.sin(elapsed * 0.9) * 0.08, sy: 1 - Math.sin(elapsed * 0.9) * 0.1, lean: -0.2 };
      }
      if (elapsed < windup) {
        // Coils back, lower and lower, while its lane fills on the floor.
        const c = ease(clamp01(elapsed / windup));
        return { height: 0, sx: 1 + 0.08 * c, sy: 1 - 0.12 * c, lean: -0.35 * c };
      }
      return { height: 0, sx: 0.92, sy: 1.05, lean: 0.5 };
    }
    case Action.Sweep: {
      if (elapsed < windup) {
        const r = ease(clamp01(elapsed / windup));
        return { height: 0.3 * r, sx: 1, sy: 1 + 0.12 * r, lean: 0 };
      }
      // Holds tall and still while the beam turns, with a faint hum.
      return { height: 0.3, sx: 1 + Math.sin(elapsed * 3) * 0.02, sy: 1.12, lean: 0 };
    }
    case Action.Slam:
      return { height: 0, sx: 1 + slamWindup * 0.12, sy: 1 - slamWindup * 0.18, lean: 0.12 * slamWindup };
    default:
      return REST;
  }
}
