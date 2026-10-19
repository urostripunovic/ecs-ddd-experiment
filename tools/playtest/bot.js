// In-page bot: plays through the real input path (keyboard events) and sets aim
// directly, since the game only overrides aim once the mouse has moved.
async () => {
  const c = await import('/src/ecs/components/index.ts');
  const w = await import('/src/ecs/core/world.ts');
  const held = new Set();
  const taps = [];
  const press = (code, down) => {
    if (down === held.has(code)) return;
    down ? held.add(code) : held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  };
  const find = (kind) => {
    for (let e = 0; e < w.world.nextFresh; e++) if (w.world.alive[e] && c.Shape.kind[e] === kind) return e;
    return -1;
  };
  // Weapons at the boss's feet cost more than walking further for one: the bot
  // used to hug the Warden for the gun it had just knocked loose.
  const nearestGrounded = (p, wantBuff, maxDist, b = -1) => {
    let best = -1, bd = maxDist;
    for (let e = 0; e < w.world.nextFresh; e++) {
      if (!w.world.alive[e] || !w.has(e, c.C.Grounded)) continue;
      if (w.has(e, c.C.BuffPickup) !== wantBuff) continue;
      const nearBoss = b >= 0 && Math.hypot(c.Transform.x[e] - c.Transform.x[b], c.Transform.z[e] - c.Transform.z[b]) < 4;
      const d = Math.hypot(c.Transform.x[e] - c.Transform.x[p], c.Transform.z[e] - c.Transform.z[p]) + (nearBoss ? 40 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  const heldItem = (p) => {
    const h = c.Wielder.held[p];
    return w.isLive(h) ? w.indexOf(h) : -1;
  };
  let strafe = 1, frame = 0, flipCooldown = 0, throwCooldown = 0, charging = false;
  window.__perfectThrows = 0;
  window.__dodges = 0;
  let dodgeReady = 0;

  function step() {
    frame++;
    const p = find(c.ShapeKind.Player);
    const b = find(c.ShapeKind.Boss);
    let mx = 0, mz = 0, fire = false;
    // Cleared: line up with the tunnel, then walk north into the dark.
    if (p >= 0 && c.RunView.status === c.RunStatus.Cleared) {
      const px = c.Transform.x[p];
      if (Math.abs(px) > 0.8) { mx = -Math.sign(px); mz = -0.4; } else { mz = -1; }
    } else if (p >= 0 && b >= 0 && c.RunView.status === c.RunStatus.Fighting && !w.has(p, c.C.Dead)) {
      const px = c.Transform.x[p], pz = c.Transform.z[p];
      const dx = c.Transform.x[b] - px, dz = c.Transform.z[b] - pz;
      const d = Math.hypot(dx, dz) || 1;
      c.PlayerInput.aimX = dx / d;
      c.PlayerInput.aimZ = dz / d;
      if (throwCooldown > 0) throwCooldown--;

      const item = heldItem(p);
      const kind = item === -1 ? 0 : c.Item.kind[item];
      const slamming = w.has(b, c.C.Slam) && d < c.Slam.radius[b] + 1.5;
      // Ideal distance band per weapon: melee closes in, the gun keeps away.
      const [near, far] = kind === 1 ? [2.8, 3.5] : kind === 2 ? [4.0, 4.6] : [7, 11];

      // Throw a blade that's nearly worn out. Never a dry gun: it reloads by itself,
      // and throwing it left the bot empty-handed across the arena.
      const dry = false;
      const hurtBad = c.Health.hp[p] < 55 && !w.has(b, c.C.Slam);
      const worn = (kind === 1 || kind === 2) && (c.Durability.value[item] < 30 || hurtBad);
      // Hold the throw and let go inside the perfect zone (44 of 60 ticks).
      if (charging && (item === -1 || c.Wielder.charge[p] >= 44)) {
        if (c.Wielder.charge[p] >= 41 && c.Wielder.charge[p] <= 48) window.__perfectThrows++;
        press('KeyQ', false); charging = false; throwCooldown = 30;
      } else if (!charging && (dry || worn) && throwCooldown === 0 && d < [0, 9.5, 15, 7][kind]) { press('KeyQ', true); charging = true; }

      const buff = nearestGrounded(p, true, 7);
      const loot = item === -1 ? nearestGrounded(p, false, 199, b) : -1;
      const goal = slamming ? -1 : loot !== -1 ? loot : buff;

      if (slamming) {
        mx = -dx / d; mz = -dz / d;
        fire = false;
      } else if (goal !== -1) {
        const gx = c.Transform.x[goal] - px, gz = c.Transform.z[goal] - pz;
        const gd = Math.hypot(gx, gz) || 1;
        mx = gx / gd; mz = gz / gd;
        fire = item !== -1;
      } else {
        fire = item !== -1 || d < 2.5;
        const radial = d < near ? -1 : d > far ? 0.9 : 0;
        mx = (-dz / d) * strafe + radial * (dx / d);
        mz = (dx / d) * strafe + radial * (dz / d);
      }
      if (flipCooldown > 0) flipCooldown--;
      if ((Math.abs(px) > 15 || Math.abs(pz) > 15) && flipCooldown === 0) { strafe = -strafe; flipCooldown = 90; }
      if (Math.abs(px) > 15) mx -= Math.sign(px);
      if (Math.abs(pz) > 15) mz -= Math.sign(pz);
      if (frame % 170 === 0) strafe = -strafe;
    }
    // A slam about to land on us: roll out, away from its centre.
    press('ShiftLeft', false);
    let roll = false;
    if (p >= 0 && b >= 0 && w.has(b, c.C.Slam) && c.Slam.timer[b] <= 8 && frame >= dodgeReady) {
      const sx = c.Transform.x[p] - c.Slam.x[b], sz = c.Transform.z[p] - c.Slam.z[b];
      const sd = Math.hypot(sx, sz);
      if (sd < c.Slam.radius[b] + 0.6) {
        mx = sd > 0.1 ? sx / sd : 1; mz = sd > 0.1 ? sz / sd : 0;
        roll = true; dodgeReady = frame + 30; window.__dodges++;
      }
    }
    press('KeyD', mx > 0.35); press('KeyA', mx < -0.35);
    press('KeyS', mz > 0.35); press('KeyW', mz < -0.35);
    press('Space', fire);
    if (roll) press('ShiftLeft', true);
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
