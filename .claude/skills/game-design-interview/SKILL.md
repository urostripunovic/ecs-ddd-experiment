---
name: game-design-interview
description: Ask the game-design questions a gameplay change leaves open (what happens after a state change, same-tick order, what applies as one unit, restarts and saves, loading and waiting) before building. Use with rules-and-simulation, or when the user asks what a change should do.
---

# Game design interview

Code can't decide these; the game's designer does, and the answer differs between games and changes while iterating. Your job is to find the question, propose an answer, and record the decision so code and tests follow it. Never write a default in silently: an answer that sounded obvious ("the clear stands") is a design choice someone else may not want.

## How to run it

- **Ask when a change touches a trigger below, not all up front.** Most changes touch none; ask nothing then.
- **One round, a few questions.** Each with the case that raises it, a proposed answer, and the alternatives: "A bullet in flight can kill you after the arena is cleared. Proposed: nothing hurts after a clear. Or: you can still die, and the run is lost."
- **Find the case before asking.** Read the code, or reproduce it in a quick test, so the question is about something real.
- **If the user is away**, take the proposal, build it, and say in one line which answer you assumed.
- **If Matt Pocock's `grilling` skill is installed**, run the questions through it instead of a second interviewer.
- **With tickets:** a ticket's open questions are asked before it's picked up, and it stays blocked until they're answered. A question found mid-ticket is asked then, and recorded before the ticket closes.

## Where the answers go

- **A rules decision** becomes a row in the area's examples table (next unused number), with the test that pins it.
- **A simulation choice** (can you be hurt after a clear) lives in one place in the code, with a comment saying it's this game's choice and what changing it takes.
- **The rules answer every state anyway**, so a simulation choice can change later without a rules change or a softlock.
- **When an answer changes**, change its row and its test on purpose, in the same commit.

## Triggers and questions

### A state change the player sees (a clear, a win, a death, a level-up)

- Can the simulation still make the opposite happen afterwards? A bullet in flight, a damage-over-time tick, a trap.
- If it can, what then? Does the shown outcome stand, or does the new event override it?
- Is that true in every level, or only the last?

### Two outcomes in one tick

- The player and the boss go down together. What wins? ("If we die, we die.")
- Two players grab the same item. Who gets it?
- The decision must not depend on which system or entity happened to report first. Test both orders.

### One decision with several consequences

- Which consequences belong together? A purchase: currency taken and item given. A quest stage: reward, journal, door.
- What must never be seen half-done: by the renderer, by a save, by another player?
- What if the same request arrives twice (a retry, a double press)? Is the second one a no-op?

### Saves and restarts

- Where does a restart begin: from scratch (a boss rush), a checkpoint on entering a level, or wherever the player was?
- What does a save keep beyond the rules state: a boss's phase mid-fight, positions, the RNG?
- Loaded into a state play rarely reaches (a cleared level, a won run), what should the player see?

### Waiting: loading, servers, stores

- How is loading hidden? A loading screen from the menu, or an in-game alley, elevator or door while the next area streams in?
- In multiplayer, who decides: the server, or the player's machine, corrected later? What does the player see while waiting?
- A purchase pending on a server: what does the player see, and what if the answer never comes?

### Something new might belong to the rules

- Does anything outside the simulation react to it: another area's rules, a save, a story beat, a checkpoint?
- If not now, what would make it? Write that down, so promoting it later is a decision, not a surprise.

## In the reference game

From `ecs-ddd-experiment`, where each answer came from the user, not from code:

| Question | Answer | Recorded as |
| --- | --- | --- |
| A bullet in flight hits you after the clear | Nothing hurts after a clear, in this game; if that changes, going down loses the run | R8, and one line in `hurt()` |
| You and the last boss go down on the same tick | You lose: "if we die, we die" | R9, tested in both orders |
| Restart after a defeat | From scratch: it's a boss rush | Saves note in the architecture doc |
| Is the boss's phase a rule? | No: only the fight reacts to it | Moved to the simulation |
