# Playtest tools

A bot that plays through the real input path, and a recorder that steps the game on a fake clock and saves one frame per video frame. Playtesting is part of every change (`rules-and-simulation`, step 6).

```sh
pip install playwright        # Chromium is expected to be installed already
npm run dev                   # in another terminal
python3 tools/playtest/record.py /tmp/frames 45 "http://localhost:5173/?bossHp=900"
ffmpeg -framerate 30 -i /tmp/frames/f%04d.jpg -c:v libx264 -pix_fmt yuv420p playtest.mp4
```

The recorder prints a status line every second (tick, run status, hp, held weapon, boss action), which is usually enough to see what went wrong before opening the frames.

- `record.py` is generic apart from its `probe`, which reads this game's components; change the probe for another game.
- `bot.js` is this game's player: aim at the boss, keep a range per weapon, roll out of a slam about to land, walk to the tunnel when cleared. It's code too: when a playtest goes badly, check the bot before tuning the game.
- `page.screenshot` waits for a real animation frame, which a frozen clock never gives, so the recorder captures frames over CDP instead.
