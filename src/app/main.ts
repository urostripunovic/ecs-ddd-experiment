import { startMatch } from '../bridge/spawn';
import { createInput } from './input';
import { createFrameDriver } from './loop';
import { createHud } from './render/hud';
import { createArenaView } from './render/scene';

const host = document.getElementById('app')!;

// ?bossHp=200 shortens the fight while tuning the greybox.
const bossHp = Number(new URLSearchParams(location.search).get('bossHp')) || undefined;
const restart = () => startMatch({ bossHp });

let match = restart();
const view = createArenaView(host, () => match.player);
const hud = createHud(document.body);
const input = createInput(host);

const frame = createFrameDriver((alpha) => {
  view.render(alpha);
  hud.update(match);
});

let last = performance.now();
function loop(now: number): void {
  if (input.consume('Enter')) match = restart();
  if (input.consume('Backquote')) hud.toggleLog();
  input.sample(view, match.player);
  frame((now - last) / 1000);
  last = now;
  input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
