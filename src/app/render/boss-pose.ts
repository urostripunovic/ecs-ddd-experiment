// How the boss looks during each action, as a pure function of the action and
// how far into it we are. The simulation only stores which action and since
// when, so animation can be tuned here without touching gameplay.
import {
  Action, BURST_WINDUP, CONE_VOLLEY_GAP, CONE_WINDUP, JUMP_AIR, JUMP_CROUCH, JUMP_RECOVER, ROAR_HOLD, ROAR_REAR,
} from '../../ecs/systems/boss-actions';

export type Pose = { height: number; sx: number; sy: number; lean: number };

const REST: Pose = { height: 0, sx: 1, sy: 1, lean: 0 };
const JUMP_PEAK = 4.5;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// elapsed: ticks since the action began, fractional (interpolated between ticks).
// slamWindup: 0..1 through a slam's telegraph, which drives its own squash.
export function bossPose(kind: number, elapsed: number, slamWindup: number): Pose {
  switch (kind) {
    case Action.Jump: {
      if (elapsed < JUMP_CROUCH) {
        // Crouch: the tell that it's about to leave the ground.
        const c = ease(clamp01(elapsed / JUMP_CROUCH));
        return { height: 0, sx: 1 + 0.18 * c, sy: 1 - 0.3 * c, lean: 0 };
      }
      const air = elapsed - JUMP_CROUCH;
      if (air < JUMP_AIR) {
        const t = air / JUMP_AIR;
        // Stretched on the way up and down, round at the top.
        const stretch = 0.15 * Math.abs(1 - 2 * t);
        return { height: 4 * JUMP_PEAK * t * (1 - t), sx: 1 - stretch * 0.5, sy: 1 + stretch, lean: 0 };
      }
      const r = clamp01((air - JUMP_AIR) / JUMP_RECOVER);
      return { height: 0, sx: 1 + 0.25 * (1 - r), sy: 1 - 0.35 * (1 - r), lean: 0 };
    }
    case Action.Cone: {
      if (elapsed < CONE_WINDUP) {
        // Rears back while the cone telegraph fills.
        return { ...REST, lean: -0.3 * ease(clamp01(elapsed / CONE_WINDUP)) };
      }
      // A recoil kick on every volley, settling between them.
      const since = (elapsed - CONE_WINDUP) % CONE_VOLLEY_GAP;
      return { ...REST, lean: 0.22 * Math.exp(-since * 0.35) };
    }
    case Action.Burst: {
      const w = clamp01(elapsed / BURST_WINDUP);
      // Swells, then snaps back as the ring goes out.
      const puff = elapsed < BURST_WINDUP ? 0.18 * ease(w) : 0.18 * Math.exp(-(elapsed - BURST_WINDUP) * 0.5);
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
    case Action.Slam:
      return { height: 0, sx: 1 + slamWindup * 0.12, sy: 1 - slamWindup * 0.18, lean: 0.12 * slamWindup };
    default:
      return REST;
  }
}
