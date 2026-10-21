// The god menu (G, dev builds only). Everything it does goes through queueDev,
// so the menu, the bot and tests share one list of cheats. The inspector is
// generated from ARENA_STATE, the declared component list, so a new component
// shows up here without touching this file.
import { handles } from '../../bridge/spawn';
import { C, GodMode } from '../../ecs/components';
import { has, isLive, MAX_ENTITIES, toHandle, world, type EntityId, type Handle } from '../../ecs/core/world';
import { timeControl } from '../loop';
import { inspect, lastJumpCheck, nameOf, queueDev, type ArenaComponent, type DevCommand, type JumpTarget } from './commands';
const JUMPS: [JumpTarget, string][] = [
  ['arena1', 'arena 1'], ['arena1Cleared', 'arena 1 cleared'], ['arena2', 'arena 2'],
  ['arena2Phase2', 'arena 2, phase 2'], ['won', 'won'],
];

export function createGodMenu(root: HTMLElement) {
  const panel = document.createElement('div');
  panel.className = 'god';
  panel.hidden = true;
  panel.innerHTML = `
    <h2>God mode <small>dev only · G to close</small></h2>
    <section><h3>Debug: forces simulation data</h3>
      <label><input type="checkbox" data-flag="invulnerable"> invulnerable</label>
      <label><input type="checkbox" data-flag="keepWeapons"> weapons never run dry or wear</label>
      <label><input type="checkbox" data-flag="freezeBoss"> freeze boss</label>
      <div class="row"><button data-give="gun">gun</button><button data-give="sword">sword</button><button data-give="spear">spear</button><button data-cmd="heal">heal</button></div>
    </section>
    <section><h3>Gameplay: through the rules</h3>
      <div class="row"><button data-cmd="damageBoss">boss −100 hp</button><button data-cmd="killBoss">kill boss</button></div>
      <div class="row" data-jumps></div>
      <p class="check" data-check></p>
    </section>
    <section><h3>Time</h3>
      <div class="row"><button data-time="pause">pause</button><button data-time="step">step 1 tick</button><button data-time="slow">¼ speed</button><button data-time="normal">normal</button></div>
      <p class="muted" data-tick></p>
    </section>
    <section><h3>Inspector</h3>
      <select data-entity></select>
      <div class="fields" data-fields></div>
    </section>`;
  root.append(panel);

  const q = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const send = (cmd: DevCommand) => queueDev(cmd);

  // Typing in the menu mustn't move the player.
  panel.addEventListener('keydown', (ev) => ev.stopPropagation());
  panel.addEventListener('keyup', (ev) => ev.stopPropagation());

  for (const box of panel.querySelectorAll<HTMLInputElement>('[data-flag]')) {
    box.addEventListener('change', () => send({ kind: 'god', flag: box.dataset.flag as 'invulnerable', on: box.checked }));
  }
  for (const btn of panel.querySelectorAll<HTMLButtonElement>('[data-give]')) {
    btn.addEventListener('click', () => send({ kind: 'give', weapon: btn.dataset.give as 'gun' }));
  }
  q('[data-cmd="heal"]').addEventListener('click', () => send({ kind: 'heal' }));
  q('[data-cmd="damageBoss"]').addEventListener('click', () => send({ kind: 'damageBoss', amount: 100 }));
  q('[data-cmd="killBoss"]').addEventListener('click', () => send({ kind: 'killBoss' }));
  const jumps = q('[data-jumps]');
  for (const [to, label] of JUMPS) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => send({ kind: 'jump', to }));
    jumps.append(btn);
  }
  for (const btn of panel.querySelectorAll<HTMLButtonElement>('[data-time]')) {
    btn.addEventListener('click', () => {
      const t = btn.dataset.time;
      if (t === 'pause') timeControl.paused = !timeControl.paused;
      if (t === 'step') { timeControl.paused = true; timeControl.steps++; }
      if (t === 'slow') timeControl.scale = 0.25;
      if (t === 'normal') { timeControl.scale = 1; timeControl.paused = false; }
    });
  }

  const entitySelect = q<HTMLSelectElement>('[data-entity]');
  const fields = q('[data-fields]');
  let selected: Handle = handles.player;
  entitySelect.addEventListener('change', () => { selected = Number(entitySelect.value) as Handle; renderFields(); });
  // On the container and on press, not per button on click: the fields redraw a
  // few times a second, and a button replaced between press and release never
  // gets its click.
  fields.addEventListener('pointerdown', (ev) => {
    const go = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-go]');
    if (!go || go.disabled) return;
    selected = Number(go.dataset.go) as Handle;
    renderEntities();
    renderFields();
  });

  function renderEntities(): void {
    const options: string[] = [];
    for (let e = 0; e < world.nextFresh && e < MAX_ENTITIES; e++) {
      if (!world.inUse[e] || !has(e as EntityId, C.Shape)) continue;
      const h = toHandle(e as EntityId);
      options.push(`<option value="${h}"${h === selected ? ' selected' : ''}>${nameOf(h)}</option>`);
    }
    entitySelect.innerHTML = options.join('');
    if (!isLive(selected)) selected = handles.player;
  }

  // Every numeric field of the selected entity that isn't zero, editable in place.
  function renderFields(): void {
    if (!isLive(selected)) { fields.textContent = 'gone'; return; }
    // A handle is shown as what it points at and isn't editable: a typed number
    // would be a packed generation and slot, easy to get wrong and never useful.
    const rows = inspect(selected).map(({ component, field, value, points }) => points === undefined
      ? `<label>${component}.${field} <input data-c="${component}" data-f="${field}" value="${+value.toFixed(3)}"></label>`
      : `<label>${component}.${field} <button data-go="${points}"${isLive(points) ? '' : ' disabled'}>${nameOf(points)}</button></label>`);
    fields.innerHTML = rows.join('') || '<span class="muted">all zero</span>';
    for (const input of fields.querySelectorAll<HTMLInputElement>('input')) {
      input.addEventListener('change', () => send({
        kind: 'set', entity: selected, component: input.dataset.c as ArenaComponent, field: input.dataset.f!, value: Number(input.value),
      }));
    }
  }

  let lastRefresh = 0;
  return {
    toggle(): void {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { renderEntities(); renderFields(); }
    },
    // A few times a second, and never while you're typing in a field or choosing
    // an entity (a clicked checkbox or button keeps focus, and mustn't freeze it).
    update(now: number): void {
      const a = document.activeElement;
      const typing = (a instanceof HTMLInputElement && a.type !== 'checkbox') || a instanceof HTMLSelectElement;
      if (panel.hidden || now - lastRefresh < 250 || (typing && panel.contains(a))) return;
      lastRefresh = now;
      for (const box of panel.querySelectorAll<HTMLInputElement>('[data-flag]')) {
        box.checked = GodMode[box.dataset.flag as 'invulnerable'];
      }
      const check = lastJumpCheck();
      q('[data-check]').textContent = check.length === 0 ? 'world agrees with the rules' : `disagrees: ${check.join('; ')}`;
      q('[data-tick]').textContent = `tick ${world.tick}${timeControl.paused ? ' · paused' : ''}${timeControl.scale !== 1 ? ` · ×${timeControl.scale}` : ''}`;
      renderEntities();
      renderFields();
    },
  };
}
