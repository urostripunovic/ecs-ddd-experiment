import { startRun } from '../bridge/spawn';
import { createInput } from './input';
import { createFrameDriver } from './loop';
import { createHud } from './render/hud';
import { createArenaView } from './render/scene';

const host = document.getElementById('app')!;

// ?bossHp=200 shortens the fight while tuning. ?seed=7 replays that run exactly:
// its bosses, rewards and drops. Without it every run, and every restart, draws a
// new seed. Math.random is fine here and only here: the app picks the seed, and
// the simulation and the rules only ever use it.
const params = new URLSearchParams(location.search);
const bossHp = Number(params.get('bossHp')) || undefined;
const fixedSeed = Number(params.get('seed')) || undefined;
const nextSeed = () => fixedSeed ?? 1 + Math.floor(Math.random() * 999_999);
const restart = () => startRun({ bossHp, seed: nextSeed() });

// The same object for the whole run: building the next arena updates it in place.
const match = restart();
const view = createArenaView(host, () => match.player);
const hud = createHud(document.body);
const input = createInput(host);

const frame = createFrameDriver((alpha) => {
  view.render(alpha);
  hud.update(match);
});

// Dev builds only, and loaded on demand, so the release bundle has none of it.
type GodMenu = { toggle(): void; update(now: number): void };
let god: GodMenu | null = null;
let clearCheats = () => {};
if (import.meta.env.DEV) {
  void import('./dev/god-menu').then(({ createGodMenu }) => { god = createGodMenu(document.body); });
  void import('./dev/commands').then(({ queueDev, clearDev }) => {
    clearCheats = clearDev;
    // The bot and the recorder send the same commands as the menu.
    (window as unknown as { __dev: unknown }).__dev = { queue: queueDev };
  });
}

let last = performance.now();
function loop(now: number): void {
  if (input.consume('Enter')) { restart(); clearCheats(); }
  if (input.consume('Backquote')) hud.toggleLog();
  // A bug in the dev menu must never stop the game loop.
  try {
    if (input.consume('KeyG')) god?.toggle();
    god?.update(now);
  } catch (err) {
    console.error('god menu:', err);
  }
  input.sample(view, match.player);
  frame((now - last) / 1000);
  last = now;
  input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
