import { PlayerInput, Transform } from '../ecs/components';
import { indexOf, isLive, type Handle } from '../ecs/core/world';
import type { ArenaView } from './render/scene';

// Samples devices into the PlayerInput singleton once per rendered frame.
// The simulation never sees a DOM event.
export function createInput(target: HTMLElement) {
  const keys = new Set<string>();
  const mouse = { x: 0, y: 0, down: false, seen: false };
  const aim = { x: 0, z: 0 };
  const pressed = new Set<string>();

  window.addEventListener('keydown', (ev) => {
    if (!keys.has(ev.code)) pressed.add(ev.code);
    keys.add(ev.code);
    // Counted at the event, not sampled per frame, so a tap shorter than a frame still throws.
    if (ev.repeat) return;
    if (ev.code === 'KeyQ') PlayerInput.throwPresses++;
    if (ev.code === 'KeyE') PlayerInput.interactPresses++;
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.code));
  // Losing focus mid-press would otherwise leave the player running forever.
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  target.addEventListener('pointermove', (ev) => { mouse.x = ev.clientX; mouse.y = ev.clientY; mouse.seen = true; });
  target.addEventListener('pointerdown', (ev) => {
    if (ev.button === 0) mouse.down = true;
    if (ev.button === 2) PlayerInput.throwPresses++;
  });
  window.addEventListener('pointerup', (ev) => { if (ev.button === 0) mouse.down = false; });
  target.addEventListener('contextmenu', (ev) => ev.preventDefault());

  const axis = (neg: string[], pos: string[]) =>
    (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

  return {
    sample(view: ArenaView, player: Handle): void {
      let mx = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
      let mz = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
      // Normalised so diagonals are not 41% faster.
      const len = Math.hypot(mx, mz);
      if (len > 0) { mx /= len; mz /= len; }
      PlayerInput.moveX = mx;
      PlayerInput.moveZ = mz;
      PlayerInput.fire = mouse.down || keys.has('Space');
      PlayerInput.reload = keys.has('KeyR');

      if (mouse.seen && isLive(player) && view.aimPoint(mouse.x, mouse.y, aim)) {
        const e = indexOf(player);
        const dx = aim.x - Transform.x[e];
        const dz = aim.z - Transform.z[e];
        const d = Math.hypot(dx, dz);
        // Inside the body the direction is noise; keep the last aim.
        if (d > 0.3) { PlayerInput.aimX = dx / d; PlayerInput.aimZ = dz / d; }
      }
    },
    // True once per key press, for one-shot actions like restart.
    consume(code: string): boolean {
      return pressed.delete(code);
    },
    endFrame(): void {
      pressed.clear();
    },
  };
}
