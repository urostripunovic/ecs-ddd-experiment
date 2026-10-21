import { bit } from '../core/world';

// One bit per component. Tags are bits with no data.
export const C = {
  Transform: bit(0),
  Velocity: bit(1),
  Health: bit(2),
  Wielder: bit(3),       // can hold one item; empty hands fight with fists
  Team: bit(4),
  Projectile: bit(5),
  PlayerControlled: bit(6),
  Boss: bit(7),
  Collider: bit(8),
  Solid: bit(9),        // tag: other colliders are pushed out of it
  Shape: bit(10),
  Slam: bit(11),        // present only while a slam is winding up
  Dead: bit(12),        // tag
  Item: bit(14),         // a weapon; exactly one of Grounded, Held, Flying, Stuck at a time
  Grounded: bit(15),     // lying in the arena, can be picked up (items and buffs)
  Held: bit(16),
  Flying: bit(17),       // thrown
  BuffPickup: bit(18),
  Airborne: bit(19),     // mid-jump: bullets, thrown weapons and blades pass underneath
  Stuck: bit(20),        // a thrown weapon lodged in its target; the fourth item state
  Invulnerable: bit(21), // hits still land and flash, but take no hp (the roar)
  TunnelPending: bit(22), // latch: the player stepped into the tunnel and the run hasn't answered yet
  Orbiting: bit(23),     // a pillar that circles the arena (Orbit); it still blocks like any pillar
  Spiked: bit(24),       // an orbiting pillar while a boss is in phase 2: touching it hurts
  PerkPickup: bit(25),   // lying in the arena; walking over it fills a perk slot
  RewardPickup: bit(26), // a boss's reward on its pedestal; stepping on it chooses it
  RewardPending: bit(27), // latch: the player chose a reward and the run hasn't answered yet
} as const;
