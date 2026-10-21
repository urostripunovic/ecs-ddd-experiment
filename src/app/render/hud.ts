// Reads components and the dev tick log; writes only DOM, and only on change.
import { DEV, readTickLog } from '../../bridge/tick-log';
import { arenaFor } from '../../ecs/arenas';
import { Ammo, BossPhase, C, Durability, GodMode, Health, Item, RunStatus, RunView, Wielder } from '../../ecs/components';
import { CHARGE_MAX_TICKS, PERFECT_FROM, PERFECT_TO, throwCharge } from '../../ecs/weapons/charge';
import { has, indexOf, world, type EntityId, type Handle } from '../../ecs/core/world';
import { furious, hasted, slowed } from '../../ecs/systems/status';
import { lowHp, Perk, perkSlots } from '../../ecs/systems/perks';
import { armorPlates } from '../../ecs/systems/armor';
import { defOf, heldItem } from '../../ecs/systems/weapons';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '') => {
  const n = document.createElement(tag);
  n.className = cls;
  n.innerHTML = html;
  return n;
};

function weaponDetail(item: EntityId | -1, mag: number, durability: number): string {
  if (item === -1) return '';
  if (mag > 0) return Ammo.reload[item] > 0 ? 'reloading' : `${Ammo.count[item]}/${mag}`;
  return durability > 0 ? `${Math.max(0, Math.ceil(Durability.value[item]))}%` : '';
}

function statusLine(p: EntityId): string {
  const parts: string[] = [];
  if (hasted(p)) parts.push('HASTE');
  if (furious(p)) parts.push('FURY');
  if (slowed(p)) parts.push('SLOWED');
  return parts.join(' · ') || ' ';
}

// Indexed by Perk. The low-hp ones are marked while they're switched on.
const PERK_LABEL = ['', 'LAST STAND', 'ADRENALINE', 'FINAL SHOT', 'RICOCHET', 'LONG REACH'];

function perkLine(player: EntityId): string {
  const live = lowHp(player);
  const on = (perk: number) => live && (perk === Perk.LastStand || perk === Perk.Adrenaline);
  return perkSlots(player).map((perk) => (perk === Perk.None ? '—' : PERK_LABEL[perk] + (on(perk) ? ' ●' : ''))).join(' · ');
}

// The boss's name for this arena of this run, planned once per arena rather than every frame.
let named = { key: '', name: '' };
function bossNameOf(seed: number, arena: number, final: boolean): string {
  const key = `${seed}:${arena}:${final}`;
  if (named.key !== key) named = { key, name: arenaFor(seed, arena, final).boss.name };
  return named.name;
}

// The doors as the player sees them: which gates went down, never why.
function doorsLine(afterReward: boolean): string {
  const take = afterReward ? 'take' : 'Take';
  if (RunView.tunnelOpen && RunView.finalDoorOpen) return `${take} the tunnel north, or the red door beside it, to the end`;
  if (RunView.finalDoorOpen) return `${take} the red door: it is the only way on`;
  return afterReward ? 'take the tunnel north' : 'The tunnel to the north is open';
}

// Any pedestal still standing means the offer is open. Read once a frame, not per tick.
function rewardsWaiting(): boolean {
  for (let e = 0; e < world.nextFresh; e++) if (world.inUse[e] && has(e as EntityId, C.RewardPickup)) return true;
  return false;
}

export function createHud(root: HTMLElement) {
  const boss = el('div', 'hud boss', `
    <div class="boss-name"><span data-boss-name></span><span data-phase></span></div>
    <div class="bar"><div data-boss-hp></div></div>`);
  const player = el('div', 'hud player', `
    <div class="bar"><div data-player-hp></div></div>
    <div class="row"><span>HP <b data-hp></b> <span data-lives></span></span><span><b data-weapon></b> <span data-weapon-state></span></span></div>
    <div class="row status" data-status></div>
    <div class="row perks" data-perks></div>`);
  const help = el('div', 'hud help', `WASD move · mouse aim · click/space attack · Shift dodge<br>Q / right-click throw · E swap · R reload<br>Enter restart · \` tick log${import.meta.env.DEV ? ' · G god mode' : ''}`);
  // The perfect zone is placed from the same constants the simulation uses, so what you see is what you get.
  const gauge = el('div', 'hud gauge', `
    <div class="gauge-fill" data-fill></div>
    <div class="gauge-zone" style="left:${PERFECT_FROM * 100}%;width:${(PERFECT_TO - PERFECT_FROM) * 100}%"></div>`);
  gauge.hidden = true;
  const log = el('pre', 'hud log');
  // Any cheat marks the run, so a screenshot or a bug report says so.
  const cheated = el('div', 'hud cheated', 'CHEATS USED');
  cheated.hidden = true;
  const banner = el('div', 'hud banner', '<div><h1 data-title></h1><p data-subtitle></p></div>');
  log.hidden = true;
  banner.hidden = true;
  root.append(boss, player, help, gauge, log, banner, cheated);

  const q = (n: HTMLElement, sel: string) => n.querySelector<HTMLElement>(sel)!;
  const bossHp = q(boss, '[data-boss-hp]');
  const phase = q(boss, '[data-phase]');
  const bossName = q(boss, '[data-boss-name]');
  const playerHp = q(player, '[data-player-hp]');
  const hpText = q(player, '[data-hp]');
  const weaponText = q(player, '[data-weapon]');
  const weaponState = q(player, '[data-weapon-state]');
  const status = q(player, '[data-status]');
  const perks = q(player, '[data-perks]');
  const lives = q(player, '[data-lives]');
  const title = q(banner, '[data-title]');
  const subtitle = q(banner, '[data-subtitle]');
  const gaugeFill = q(gauge, '[data-fill]');
  // Indexed by ChargeZone.
  const ZONE_CLASS = ['building', 'perfect', 'over'];

  // Skips DOM writes when nothing changed, so the HUD costs nothing at rest.
  const last = new Map<HTMLElement, string>();
  const set = (n: HTMLElement, key: 'text' | 'scale', v: string) => {
    if (last.get(n) === v) return;
    last.set(n, v);
    if (key === 'text') n.textContent = v;
    else n.style.transform = `scaleX(${v})`;
  };
  let logShown = -1;

  return {
    toggleLog(): void {
      log.hidden = !log.hidden;
      logShown = -1;
    },
    update(h: { player: Handle; boss: Handle }): void {
      const b = indexOf(h.boss);
      const p = indexOf(h.player);
      set(bossHp, 'scale', (Health.hp[b] / Health.max[b]).toFixed(3));
      // No total: how long the run is depends on when you're ready, which is never shown.
      set(phase, 'text', `${RunView.final ? 'the final' : `arena ${RunView.arena}`} · phase ${BossPhase.phase[b]}`);
      set(bossName, 'text', bossNameOf(RunView.seed, RunView.arena, RunView.final));
      set(playerHp, 'scale', (Health.hp[p] / Health.max[p]).toFixed(3));
      set(hpText, 'text', String(Math.ceil(Health.hp[p])));
      // Revives as hearts, armor plates as diamonds: both readable at a glance mid-dodge.
      set(lives, 'text', `${'♥'.repeat(RunView.revives)}${armorPlates(p) > 0 ? ' ' + '◆'.repeat(armorPlates(p)) : ''}`);
      const item = heldItem(p);
      const def = defOf(item);
      // The level is fine to show, unlike power: it's what you'd compare when deciding to swap.
      set(weaponText, 'text', item === -1 ? def.name.toUpperCase() : `${def.name.toUpperCase()} LV ${Item.level[item]}`);
      set(weaponState, 'text', weaponDetail(item, def.mag, def.durability));
      set(status, 'text', statusLine(p));
      set(perks, 'text', perkLine(p));

      const fill = Wielder.charge[p] / CHARGE_MAX_TICKS;
      gauge.hidden = fill === 0;
      if (fill > 0) {
        set(gaugeFill, 'scale', fill.toFixed(3));
        gaugeFill.className = `gauge-fill ${ZONE_CLASS[throwCharge(fill).zone]}`;
      }

      cheated.hidden = !GodMode.cheated;

      const over = RunView.status !== RunStatus.Fighting;
      banner.hidden = !over;
      if (over) {
        const cleared = RunView.status === RunStatus.Cleared;
        set(title, 'text', cleared ? 'ARENA CLEARED' : RunView.status === RunStatus.Won ? 'VICTORY' : 'DEFEATED');
        set(subtitle, 'text', cleared
          ? `${rewardsWaiting() ? 'Pick a reward, then ' : ''}${doorsLine(rewardsWaiting())}`
          : `Seed ${RunView.seed} · add ?seed=${RunView.seed} to the address to play it again · Enter for a new run`);
      }

      if (!log.hidden && !DEV) {
        set(log, 'text', 'tick log is dev-only: run npm run dev');
      } else if (!log.hidden) {
        const lines = readTickLog(14);
        if (lines.length !== logShown || lines.length === 14) {
          log.textContent = lines.length ? lines.join('\n') : 'tick log: nothing crossed the bridge yet';
          logShown = lines.length;
        }
      }
    },
  };
}
