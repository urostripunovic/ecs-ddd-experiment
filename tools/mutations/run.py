"""Breaks the code on purpose, one change at a time, and checks a test catches each.

The rules-and-simulation skill asks for every test that guards against a future
mistake to be seen failing once. This makes that repeatable: each entry below is
one deliberate bug and the tests that must catch it. Run from the repo root:

    python3 tools/mutations/run.py

Each file is copied aside, broken, tested and restored from the copy, so the
working tree ends as it started. A bug is "caught" when vitest exits non-zero:
the exit code, not the printed summary, which an earlier version misread and
reported every bug as missed. If a run ever catches nothing, break one thing by
hand before trusting it.
"""
import subprocess, shutil, sys

# (what it breaks, file, exact text to replace, replacement, tests to run)
M = [
 ("revive doesn't stand you up", "src/ecs/systems/rewards.ts", "  remove(player, C.Dead);\n", "", "src/ecs/systems/rewards.test.ts src/bridge/run/flow.test.ts"),
 ("revive keeps nearby bullets", "src/ecs/systems/rewards.ts", "    if (d <= REVIVE_CLEAR_RADIUS) despawn(shot);", "    void d;", "src/ecs/systems/rewards.test.ts"),
 ("a plate never breaks", "src/ecs/systems/damage.ts", "    Armor.broken[target]++;\n", "", "src/ecs/systems/rewards.test.ts"),
 ("pedestal sensor never latches", "src/ecs/systems/rewards.ts", "      add(player, C.RewardPending);\n", "", "src/ecs/systems/rewards.test.ts"),
 ("Scattergun fires one pellet", "src/ecs/systems/weapons.ts", "for (let k = 0; k < def.pellets; k++)", "for (let k = 0; k < 1; k++)", "src/ecs/systems/rewards.test.ts"),
 ("no pedestals on a clear", "src/bridge/run/rewards.ts", "  offer.forEach(", "  [].forEach(", "src/bridge/run/flow.test.ts"),
 ("no pedestals when loading a cleared arena", "src/bridge/spawn.ts", "  if (store.run.status === 'Cleared' && store.run.offer) spawnPedestals(store.run.offer);", "", "src/bridge/run/load.test.ts"),
 ("a refusal keeps the latch", "src/bridge/run/projector.ts", "      if (p !== -1) remove(p, C.RewardPending);\n      return `latch released (${e.reason})`;", "      return `latch released (${e.reason})`;", "src/bridge/run/flow.test.ts"),
 ("perks allow a repeat", "src/ecs/systems/perks.ts", "k !== Perk.None && k !== kind", "k !== Perk.None", "src/ecs/systems/perks.test.ts"),
 ("Last stand does nothing", "src/ecs/systems/status.ts", "(lastStand(entity) ? PERK_DMG_MUL : 1)", "1", "src/ecs/systems/perks.test.ts"),
 ("Final shot never blows up", "src/ecs/systems/weapons.ts", "  if (charge.zone === ChargeZone.Overcharged) {", "  if (false) {", "src/ecs/systems/perks.test.ts"),
 ("Ricochet never bounces", "src/ecs/systems/weapons.ts", "    if (landed && Thrown.bounces[f] > 0) {", "    if (false) {", "src/ecs/systems/perks.test.ts"),
 ("Long reach does nothing", "src/ecs/systems/weapons.ts", "def.reach * LONG_REACH_MUL : def.reach", "def.reach : def.reach", "src/ecs/systems/perks.test.ts"),
 ("perks don't carry over", "src/bridge/spawn.ts", "  setPerks(p, loadout.perks.map((name) => PERK_NUMBER[name]));\n", "", "src/bridge/run/flow.test.ts"),
 ("spikes have no cooldown", "src/ecs/systems/pillars.ts", "      SpikeHit.readyAt[player] = after(SPIKE_COOLDOWN);\n", "", "src/ecs/systems/pillars.test.ts"),
 ("pillars move in cutscenes", "src/ecs/systems/pillars.ts", "export function orbitSystem(dt: Seconds): void {\n  if (controlsLocked()) return;", "export function orbitSystem(dt: Seconds): void {", "src/ecs/systems/pillars.test.ts"),
 ("spikes hurt through a dodge", "src/ecs/systems/damage.ts", "  if (has(target, C.Invulnerable) || dodging(target)) return false;", "  if (has(target, C.Invulnerable)) return false;", "src/ecs/systems/pillars.test.ts"),
 ("the ring leaves no gaps", "src/ecs/systems/boss-scripts.ts", "    if (!inGap(a, gapAt, RING_GAP_HALF)) shoot(boss, a, RING_SPEED);", "    shoot(boss, a, RING_SPEED);", "src/ecs/systems/patterns.test.ts"),
 ("the ring's gaps turn too far", "src/ecs/systems/boss-scripts.ts", "export const RING_TURN = 0.14;", "export const RING_TURN = 0.3;", "src/ecs/systems/patterns.test.ts"),
 ("a revive is never used", "src/domain/run/run.ts", "      return s.revives > 0\n", "      return false\n", "src/domain/run/run.test.ts"),
 ("the offer can repeat a reward", "src/domain/run/run.ts", "pool.splice(Math.floor(next() * pool.length), 1)", "pool.slice(0, 1)", "src/domain/run/run.test.ts"),
 ("revive offered at eight", "src/domain/run/run.ts", "r !== 'revive' || revives < MAX_REVIVES", "true", "src/domain/run/run.test.ts"),
 ("a swing ignores the level", "src/ecs/systems/weapons.ts", "def.dmg * dmgMul(w) * levelMul(heldItem(w))", "def.dmg * dmgMul(w)", "src/ecs/systems/weapons.test.ts"),
 ("a shot ignores the level", "src/ecs/systems/weapons.ts", "times(def.dmg, dmgMul(w) * levelMul(item))", "times(def.dmg, dmgMul(w))", "src/ecs/systems/weapons.test.ts"),
 ("a throw ignores the level", "src/ecs/systems/weapons.ts", "charge.dmgMul * levelMul(item);", "charge.dmgMul;", "src/ecs/systems/weapons.test.ts"),
 ("the Final shot ignores the level", "src/ecs/systems/weapons.ts", "dmgMul(wielder) * levelMul(gun))", "dmgMul(wielder))", "src/ecs/systems/weapons.test.ts"),
 ("stock comes at level 1", "src/ecs/systems/weapons.ts", "spawnWeapon(kind, spot.x, spot.z, weaponLevelFor(RunView.arena))", "spawnWeapon(kind, spot.x, spot.z)", "src/ecs/systems/weapons.test.ts"),
 ("a gift comes at level 1", "src/ecs/systems/weapons.ts", "Transform.z[w], weaponLevelFor(RunView.arena)));", "Transform.z[w]));", "src/ecs/systems/weapons.test.ts"),
 ("the snapshot drops the level", "src/bridge/run/commands.ts", "Ammo.count[w], Item.level[w])", "Ammo.count[w], 1)", "src/bridge/run/flow.test.ts"),
 ("the carried weapon takes the arena's level", "src/bridge/spawn.ts", "spawnWeapon(carriedKind, px, pz, loadout.weapon.level)", "spawnWeapon(carriedKind, px, pz, weaponLevelFor(arena))", "src/bridge/run/flow.test.ts"),
 ("a new arena's stock is level 1", "src/bridge/spawn.ts", "      spawnWeapon(kind, x, z, stockLevel);", "      spawnWeapon(kind, x, z);", "src/bridge/run/flow.test.ts"),
 ("power ignores the level", "src/domain/run/run.ts", "1 + POWER_PER_WEAPON_LEVEL * (loadout.weapon.level - 1)", "1", "src/domain/run/run.test.ts"),
 ("any weapon level is carriable", "src/domain/run/run.ts", "Number.isInteger(level) && level >= 1 && level <= MAX_ARENAS", "true", "src/domain/run/run.test.ts"),
 ("the chakram hits once a flight", "src/ecs/systems/weapons.ts", "    Thrown.leg[f] = 1;\n    Thrown.lastHit[f] = NOBODY;", "    Thrown.leg[f] = 1;", "src/ecs/systems/specials.test.ts"),
 ("the chakram never comes home", "src/ecs/systems/weapons.ts", "    if (!turn) return;", "    if (!turn) return;\n    putOnGround(f, x, z, defOf(f).throwLockTicks);\n    return;", "src/ecs/systems/specials.test.ts"),
 ("catching the chakram gives no haste", "src/ecs/systems/weapons.ts", "    Buffs.hasteUntil[w] = Math.max(Buffs.hasteUntil[w], after(CATCH_HASTE_TICKS));\n", "", "src/ecs/systems/specials.test.ts"),
 ("the hammer sticks like a blade", "src/ecs/systems/weapons.ts", "    if (struck !== -1 && style === 'smash') { smash(f, targets); continue; }", "", "src/ecs/systems/specials.test.ts"),
 ("the smash leaves lodged weapons", "src/ecs/systems/weapons.ts", "    releaseStuck(t);\n    hit = true;", "    hit = true;", "src/ecs/systems/specials.test.ts"),
 ("the smash has no radius", "src/ecs/systems/weapons.ts", "    const r = SMASH_RADIUS + Collider.radius[t];", "    const r = 99;", "src/ecs/systems/specials.test.ts"),
 ("the beam stops at the first body", "src/ecs/systems/specials.ts", "    if (has(solid, C.Health)) continue; // bodies are pierced, not walls", "", "src/ecs/systems/specials.test.ts"),
 ("the beam goes through pillars", "src/ecs/systems/specials.ts", "    reach = Math.min(reach, rayToCircle(x, z, dx, dz, Transform.x[solid], Transform.z[solid], Collider.radius[solid]));", "", "src/ecs/systems/specials.test.ts"),
 ("the railgun never overheats", "src/ecs/systems/weapons.ts", "  if (charge.zone === ChargeZone.Overcharged) { Ammo.reload[gun] = RAIL_VENT; return; }", "", "src/ecs/systems/specials.test.ts"),
 ("the railgun fires while held", "src/ecs/systems/weapons.ts", "  if (!released) {\n    if (PlayerInput.fire", "  if (false) {\n    if (PlayerInput.fire", "src/ecs/systems/specials.test.ts"),
 ("tracers never go", "src/ecs/systems/specials.ts", "    if (world.tick >= Tracer.until[tracer]) despawn(tracer);", "", "src/ecs/systems/specials.test.ts"),
 ("burning stops at once", "src/ecs/systems/specials.ts", "    if (world.tick >= Burn.until[entity]) continue;", "    if (world.tick >= Burn.until[entity] || true) continue;", "src/ecs/systems/specials.test.ts"),
 ("the flamethrower burns no fuel", "src/ecs/systems/weapons.ts", "  wear(flamer, def.fuelPerSec * dt);\n", "", "src/ecs/systems/specials.test.ts"),
 ("no special in the stock", "src/ecs/systems/weapons.ts", "WEAPON_STOCK[kind] + (kind === Stock.special ? 1 : 0)", "WEAPON_STOCK[kind]", "src/ecs/systems/specials.test.ts"),
 ("a new arena lays out no special", "src/bridge/spawn.ts", "WEAPON_STOCK[kind] + (kind === planned.special ? 1 : 0)", "WEAPON_STOCK[kind]", "src/bridge/run/flow.test.ts"),
 ("the tick forgets the burn", "src/app/loop.ts", "  burnSystem();\n", "", "src/app/loop.test.ts"),
]
bad = []
for name, path, old, new, tests in M:
    src = open(path).read()
    if old not in src:
        print(f"SKIP (text not found): {name}"); bad.append(name); continue
    shutil.copy(path, path + ".orig")
    try:
        open(path, "w").write(src.replace(old, new, 1))
        r = subprocess.run(f"npx vitest run {tests}", shell=True, capture_output=True, text=True)
        failed = r.returncode != 0
        print(("caught " if failed else "MISSED ") + name)
        if not failed: bad.append(name)
    finally:
        shutil.move(path + ".orig", path)
print("missed:", bad)
sys.exit(1 if bad else 0)
