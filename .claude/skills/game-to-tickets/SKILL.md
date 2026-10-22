---
name: game-to-tickets
description: Cut a game's next features into tickets once its prototype or vertical slice is worth building on, with decisions as examples rows, a predicted footprint, invariants and a playtest criterion. Use when moving from prototyping to production, not while the design still changes daily.
disable-model-invocation: true
---

# Game to tickets

Turn the next stretch of a game (more arenas, bosses, weapons, a new area) into tickets an agent can pick up one at a time. The prototype already holds what a ticket points at: the rules examples tables, the glossary, the architecture doc (tick order, lifetimes) and the design decisions. A ticket points at those; it never restates them.

Use Matt Pocock's `to-tickets` for work that isn't gameplay (menus, settings, builds, store pages) and this skill for gameplay. The template matches his, so his `implement` reads either kind.

A rules area that was modelled with the ddd-skill kit (it has a context file in `docs/domain/`) is cut by `ddd-to-tickets` instead, from its approved model, and built with `ddd-implementation`. Run that first, and list its tickets as blockers here, so a feature waits for the rule it reads.

## Before you start: the gate

Tickets are cut from a base worth keeping. Check each, and stop with the list of what fails:

- [ ] Someone has played it, not only the bot, and the core loop is fun.
- [ ] The examples tables have barely changed lately: decisions are settling.
- [ ] No open softlocks or stuck states.
- [ ] Every "not covered yet" item and every "this game's choice" comment has been looked at: needed now, or deliberately later.
- [ ] The playtest bot and its scripts live in the repository.
- [ ] `check` and `build` pass.

Note the commit the base is at (`git log -1 --format=%h`). Every ticket carries it.

## Scope

Ask what to cut tickets for if the user didn't say: one feature, a content batch, or what a design change touched. Read any spec or plan they point to. Gameplay the spec wants that raises open design questions is still a ticket: list the questions on it (see **Decisions**).

## Ticket kinds

A ticket is one commit per layer, or one small pull request: reviewable in one sitting, done when its tests and playtest pass.

1. **Feature:** a new mechanic through every layer it touches (a dodge, a charge attack, stealth suspicion). The first feature in an area is the tracer: it proves the layers before more of the same is built on them.
2. **Content:** another instance of something that exists (an arena layout, a boss definition and its choreography, a weapon definition). Definitions tables and scripts; no new mechanics. If it needs one, it's a feature ticket first.
3. **Rule:** a change to a rules area: new examples rows, their requests and facts, the seam test and the load test. For an area modelled in `docs/domain/`, `ddd-to-tickets` cuts these.
4. **Tuning:** numbers only, judged by playtest. Its acceptance is a playtest criterion, not a unit test.
5. **Tooling:** the bot, playtest scripts, scan tests, debug views.

Blocked by: a content ticket by the feature it uses; anything reading a rule by the rule ticket. The footprint is each ticket's blast radius: tickets with no blocking edge and no shared files can run in parallel, each in its own git worktree. Two tickets that touch the same file (a components list, the tick order) are worked one after the other, or the shared change becomes its own small ticket first.

## Decisions

Every decision a ticket depends on is either already recorded (an examples row, a "this game's choice" comment) and named by row, or listed as an open question. A ticket with open questions is blocked until `game-design-interview` answers them and the answers are recorded. Never cut a ticket that settles a design question silently.

## Check, then ask

Before showing anything, check that every new examples row and every open question appears in exactly one ticket. Then show the breakdown as a numbered list (title, kind, blocked by, decisions, footprint in one line) and ask:

- Is the first ticket the riskiest one, the one that would change the rest if it failed?
- Are the blocking edges right?
- Is any playtest criterion too vague to judge?

Iterate until the user approves. Don't publish before that.

## Publish

If `docs/agents/issue-tracker.md` exists, follow it, one issue per ticket in dependency order. Otherwise write `.scratch/tickets/<NN>-<slug>.md`, numbered in dependency order. Use the glossary's words; no code in a ticket.

<ticket-template>

# <NN>: <what the player gets, in glossary terms>

**Kind:** feature | content | rule | tuning | tooling

**Base:** commit `<commit>`. If the examples tables changed since, check this ticket's rows before starting.

**What to build:** one or two sentences, from the player's point of view.

**Decisions:** rows <R3, R9> | open: <question> (blocked until answered)

**Footprint:** predicted as in `rules-and-simulation`, step 1: files by layer, and the existing tests this breaks.

**Invariants touched:** each one, with the test that pins it.

**Blocked by:** <tickets> | None (can start immediately)

**Acceptance criteria**

- [ ] Examples rows <n, n> pass, one test each
- [ ] Test levels this change needs: rules · seam and load · simulation long run · transition · determinism
- [ ] Each new test failed before the change
- [ ] Playtest: <a criterion someone can judge, e.g. "the bot clears it in under 3 minutes without getting stuck">, with frames or a short video
- [ ] Footprint compared with what changed; each miss explained
- [ ] `check` and `build` pass

**Out of scope:** what a reader might expect here and will find in another ticket, by number.

</ticket-template>

## When the design changes

Don't cut a new set. Update the open tickets whose rows changed (and their base commit), cut tickets only for what's new, and cut a small follow-up for a finished ticket whose rows changed. Show the user what you touched and why before publishing.
