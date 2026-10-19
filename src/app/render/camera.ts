// Where the camera looks, as a pure step so it can be tested without three.js.
// It's presentation state, so it lives in the app and never reaches the simulation.

// focus: the handle the camera last followed.
export type Follow = { x: number; z: number; focus: number };

const STIFFNESS = 8;

// Eases toward the target, frame-rate independently (the same feel at 30 Hz and
// 144 Hz). A different focus means a new entity: the next arena or a restart.
// Easing there would pan across the map from where the old player stood, so it snaps.
export function follow(cam: Follow, focus: number, x: number, z: number, dt: number): void {
  if (focus !== cam.focus) {
    cam.x = x;
    cam.z = z;
    cam.focus = focus;
    return;
  }
  const k = 1 - Math.exp(-dt * STIFFNESS);
  cam.x += (x - cam.x) * k;
  cam.z += (z - cam.z) * k;
}
