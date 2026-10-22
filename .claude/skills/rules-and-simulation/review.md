# Reviewing a rules-and-simulation change

For the reviewer, read with the diff and the change's report. A game points its reviewer here from `CODING_STANDARDS.md` (Matt Pocock's `code-review` reads that file on its Standards axis). The rules themselves live in `rules-and-simulation` and `game-implementation`; this page says what to look for in a diff, not why.

Everything here is a judgement call. Skip what the structure checks and the zone lint already enforce (file names in comments, kind comparisons outside definitions, an unlisted shared writer, a system missing from the tick order, a name the rules can't speak): if one of those slipped through, the finding is the check, not the code.

## The report

- [ ] A footprint predicted before and compared after, with each miss explained.
- [ ] Each new test's failing line, failing on its assertion, not on a missing module.
- [ ] Friction is named (step 8 of `rules-and-simulation`), or the report says there was none. Silence there is a finding.

## The design

- [ ] Any choice a player would feel was asked, not made; the answer is an examples row with a status. A default written in silently is a finding even when it's a good default.
- [ ] New state passed "what reacts?": in the simulation unless something outside it reacts, with a declared lifetime and units at its edges.
- [ ] A new request has a row or a test for each rules state, the unreachable ones too. A state with no answer is a softlock waiting for the design to change.

## The seam

- [ ] It only maps: no outcome decided there, no projector computing something no fact says.
- [ ] Names cross through their vocabulary's table; no hand-written way back, no conditional turning a number into a name.
- [ ] A value newly held on both sides is never live in both at once, and the state check covers it.

## The simulation

- [ ] Each new shared-writers entry gives one of the sound reasons `game-implementation` lists. "Several sources write it directly" is debt, and the entry says so.
- [ ] Growth: a module that took one more special case, a file every feature touches, a stage report where one file grows each time. Ask for its one-sentence job; an "or" in the sentence is a split waiting.
- [ ] New behaviour is a component and a system, not a field on a definition that a system branches on.

## The tests

- [ ] Each one asserts what only the new behaviour changes, against a baseline that counts everything (setup ticks included), relative where the rule is relative.
- [ ] Systems are stepped through the game's tick order, and state (random streams included) is reset per case.
- [ ] Playtested, with frames or a log that shows the criterion was met.

## The commits

- [ ] Each does one thing its subject names, and says why.
