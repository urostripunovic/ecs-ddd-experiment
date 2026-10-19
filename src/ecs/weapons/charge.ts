// The throw gauge as one pure function, so tuning it never touches a system
// and the HUD draws exactly the zones the simulation uses.

import { inTicks, seconds } from '../core/units';

export const CHARGE_MAX_TICKS = inTicks(seconds(1));
export const PERFECT_FROM = 0.68;
export const PERFECT_TO = 0.8;
const MAX_DMG = 1.25;
const MIN_DMG = 0.4;

export const ChargeZone = { Building: 0, Perfect: 1, Overcharged: 2 } as const;

export type ThrowCharge = { zone: number; dmgMul: number; wearMul: number; speedMul: number };

// fill: 0..1 of the gauge.
// Perfect and overcharged hit equally hard; what perfect buys is the weapon's life.
export function throwCharge(fill: number): ThrowCharge {
  const f = Math.max(0, Math.min(1, fill));
  const speedMul = 0.6 + 0.4 * f;
  if (f < PERFECT_FROM) {
    return { zone: ChargeZone.Building, dmgMul: MIN_DMG + (1 - MIN_DMG) * (f / PERFECT_FROM), wearMul: 1, speedMul };
  }
  if (f <= PERFECT_TO) return { zone: ChargeZone.Perfect, dmgMul: MAX_DMG, wearMul: 0.5, speedMul };
  return { zone: ChargeZone.Overcharged, dmgMul: MAX_DMG, wearMul: 2, speedMul };
}
