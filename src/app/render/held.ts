// The weapon in the player's hand, and the flamethrower's flame: drawn where
// the hand is, which the simulation doesn't track (it keeps held items at the
// player's centre). Swing, thrust and spin are presentation only.
import * as THREE from 'three';
import { PlayerInput, ShapeKind, Transform, Wielder } from '../../ecs/components';
import { handleAt, indexOf, isLive, type Handle } from '../../ecs/core/world';
import { CHARGE_MAX_TICKS } from '../../ecs/weapons/charge';
import { flameMat, geo, HAND_HEIGHT, SWING_TICKS, type Visual } from './meshes';

export class HeldWeapon {
  private readonly flame = new THREE.Mesh(geo.flame, flameMat);

  constructor(scene: THREE.Scene) {
    this.flame.visible = false;
    scene.add(this.flame);
  }

  // Held items are drawn in the player's hand: the simulation only keeps them at
  // the player's centre, and the hand, swing and thrust are presentation.
  draw(h: Handle, visuals: readonly (Visual | null)[], visualKind: Uint8Array, alpha: number): void {
    const flame = this.flame;
    flame.visible = false;
    if (!isLive(h)) return;
    const p = indexOf(h);
    const item = handleAt(Wielder.held, p);
    if (!isLive(item)) return;
    const v = visuals[indexOf(item)];
    if (!v) return;

    const yaw = Math.atan2(-PlayerInput.aimX, -PlayerInput.aimZ);
    const progress = Wielder.swing[p] > 0 ? 1 - Wielder.swing[p] / SWING_TICKS : 0;
    const kind = visualKind[indexOf(item)];
    const thrust = kind === ShapeKind.Spear ? Math.sin(progress * Math.PI) * 0.9 : 0;
    // A sword sweeps right to left across the arc.
    const sweep = kind === ShapeKind.Sword && progress > 0 ? 1.1 - 2.2 * progress : 0;

    const px = Transform.px[p] + (Transform.x[p] - Transform.px[p]) * alpha;
    const pz = Transform.pz[p] + (Transform.z[p] - Transform.pz[p]) * alpha;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // Right hand: forward rotated a quarter turn clockwise.
    v.position.set(px - fz * 0.45 + fx * (0.15 + thrust), HAND_HEIGHT, pz + fx * 0.45 + fz * (0.15 + thrust));
    v.rotation.set(0, yaw + sweep, 0);
    v.scale.setScalar(1);
    // A spinning hammer circles you, head out, faster as its momentum builds.
    if (kind === ShapeKind.Warhammer && PlayerInput.throwHeld && Wielder.charge[p] > 0) {
      const momentum = Math.min(1, Wielder.charge[p] / CHARGE_MAX_TICKS);
      const turn = (performance.now() / 1000) * (9 + 15 * momentum);
      v.position.set(px, HAND_HEIGHT, pz);
      v.rotation.set(0, turn, 0);
    }
    // The flame shows while the simulation says it's spraying (it keeps swing up then).
    if (kind === ShapeKind.Flamethrower && Wielder.swing[p] > 0) {
      flame.visible = true;
      flame.position.set(v.position.x + fx * 0.6, HAND_HEIGHT, v.position.z + fz * 0.6);
      flame.rotation.set(0, yaw, 0);
      flame.scale.setScalar(0.92 + Math.sin(performance.now() / 30) * 0.08);
    }
  }
}
