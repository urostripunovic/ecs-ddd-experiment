---
name: greybox-gym
description: Prototype a new gameplay mechanic in its own greybox gym before it goes into any level. Use when adding a mechanic the game doesn't have yet (climbing, stealth, parry, a new movement option), or when a mechanic feels wrong inside a level.
---

# Greybox gyms

A gym is a greybox scene with one mechanic and the minimum around it to test it. Feel problems can't hide behind other systems there, and the numbers it settles become the limits every level, enemy and encounter is built within.

Gyms follow the loop in `rules-and-simulation`; this skill only adds where the playtest happens and where its numbers go.

## A new mechanic

1. **Ask how it should feel** before building (`game-design-interview`). Feel is the designer's call: freeform or authored, forgiving or strict, fast or weighty.
2. **Name it once.** The mechanic's name is its gym, its section in `docs/METRICS.md` and its design note in `docs/design/<name>.md`. Same name everywhere, so the file to read is the one named after what you're touching.
3. **Build the gym**: only that mechanic, plus the props that probe its edges (ledges at several heights, a guard at several distances). Reachable from the god menu, every tuning value a URL flag, so tuning needs no code edits.
4. **Playtest in the gym** (step 6 of the loop). The designer tunes; the bot checks the edges.
5. **Record the numbers** in `docs/METRICS.md` under the mechanic's name, with status like the examples tables: experimental while tuning, accepted once the designer signs off.

## Combining

Once each mechanic feels right alone, build one small combined greybox that mixes them. It tests interactions no gym can show: climbing out of a fight, a parry heard by a guard.

When something feels off there, go back to that mechanic's gym and tune it there. Tuning inside a level spreads one mechanic's numbers across many places.

## Metrics are limits

Content built on a mechanic stays within its metrics. Content that needs a value outside them is a design change: ask, update the metric, re-check its gym, then build the content. Where a metric can be measured (gap widths, attack timings against a parry window), a test checks content against it.
