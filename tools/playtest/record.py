"""Records the bot playing on a fake clock, one screenshot per video frame."""
import base64, json, os, sys, time
from playwright.sync_api import sync_playwright

out, seconds, fps = sys.argv[1], float(sys.argv[2]), 30
url = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:5173/"
# Optional: dev commands to send before playing, e.g. '[{"kind":"jump","to":"arena2Phase2"}]',
# so a playtest can start where the change is instead of playing up to it.
start = json.loads(sys.argv[4]) if len(sys.argv) > 4 else []
os.makedirs(out, exist_ok=True)
bot = open(os.path.join(os.path.dirname(__file__), "bot.js")).read()
probe = """async () => { const c = await import('/src/ecs/components/index.ts'); const w = await import('/src/ecs/core/world.ts');
  let hp = {}; for (let e = 0; e < w.world.nextFresh; e++) if (w.world.inUse[e] && c.Shape.kind[e] <= 2 && c.Shape.kind[e] > 0) hp[c.Shape.kind[e] === 1 ? 'player' : 'boss'] = Math.round(c.Health.hp[e]);
  let held = '-'; let ground = 0;
  for (let e = 0; e < w.world.nextFresh; e++) {
    if (!w.world.inUse[e]) continue;
    if (w.has(e, c.C.Grounded)) ground++;
    if (c.Shape.kind[e] === 1) { const h = c.Wielder.held[e]; if (w.isLive(h)) { const i = w.indexOf(h); held = ['fists','sword','spear','gun','scattergun','chakram','hammer','railgun','flamer'][c.Item.kind[i]] + ':L' + c.Item.level[i] + ':' + ([3, 4, 7].includes(c.Item.kind[i]) ? c.Ammo.count[i] : Math.round(c.Durability.value[i])); } }
  }
  let act = '-'; for (let e = 0; e < w.world.nextFresh; e++) if (w.world.inUse[e] && c.Shape.kind[e] === 2) act = ['idle','slam','cone','burst','jump','roar','ring','spiral','storm'][c.BossAction.kind[e]] + (w.has(e, c.C.Airborne) ? '^' : '');
  return { tick: w.world.tick, status: c.RunView.status, arena: c.RunView.arena, ...hp, held, ground, act, revives: c.RunView.revives, perfect: window.__perfectThrows, finalShots: window.__finalShots, dodges: window.__dodges, rail: window.__railShots, burning: (() => { for (let e = 0; e < w.world.nextFresh; e++) if (w.world.inUse[e] && c.Shape.kind[e] === 2) return w.world.tick < c.Burn.until[e]; return false; })(), perks: (await import('/src/ecs/systems/perks.ts')).perkSlots(Array.from({length: w.world.nextFresh}, (_, e) => e).find((e) => w.world.inUse[e] && c.Shape.kind[e] === 1) ?? 0) }; }"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.clock.install()
    pg.goto(url)
    # Freeze time so the game only advances when we step it, however slow rendering is.
    pg.clock.pause_at(pg.evaluate("Date.now()") + 50)
    pg.clock.run_for(500)
    cdp = pg.context.new_cdp_session(pg)
    if start:
        # The dev commands load on demand; wait for them without the page's (frozen) timers.
        for _ in range(100):
            if pg.evaluate("!!window.__dev"):
                break
            time.sleep(0.1)
        pg.evaluate("cmds => cmds.forEach(c => window.__dev.queue(c))", start)
    pg.evaluate(bot)
    pg.keyboard.press("Backquote")
    t0 = time.time()
    frames = int(seconds * fps)
    ended_at = None
    for i in range(frames):
        pg.clock.run_for(34 if i % 3 == 0 else 33)  # 100 ms per 3 frames = 30 fps
        # Page.screenshot waits for a real animation frame, which a frozen clock never gives.
        shot = cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 88})
        open(f"{out}/f{i:04d}.jpg", "wb").write(base64.b64decode(shot["data"]))
        if i % 30 == 0:
            s = pg.evaluate(probe)
            print(i, s, round(time.time() - t0, 1), flush=True)
            if s["status"] in (1, 2) and ended_at is None:
                ended_at = i
            if ended_at is not None and i - ended_at >= 75:
                break
    b.close()
