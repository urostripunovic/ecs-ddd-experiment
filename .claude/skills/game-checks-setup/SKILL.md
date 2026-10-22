---
name: game-checks-setup
description: Set up the structure checks for a game built as a simulation (ECS) plus a thin rules module, in any language — once after the first feature exists, and again when a retro adds a kind of check. Run by name ("set up the checks"), not automatically.
---

# Setting up the checks

`game-implementation` says why a game needs structure checks and what each one guards. This skill is how to put them into a new game, in whatever language it's written: when, in what order, how each is proved, and which tool fits each language.

## When

- **Once, after the first feature exists.** Before that there's nothing to check: "every system is in the tick order" passes on an empty repo, and a check you can't break on purpose is a check you can't trust. The boundary lint is the exception; it goes in with the first commit.
- **Again when a retro adds a kind of check.** Add that one; don't redo the rest.
- Not after every session. The checks run with the tests; they don't need setting up again.

## How

1. **Read the code first.** Find the zones, the systems, how the tick runs, where randomness comes from, where definitions live. Each check is written for this code; a check written for code you haven't read checks the wrong thing.
2. **Take the checks in the order below.** Later ones rely on earlier ones (the step-list check needs a tick order to step from).
3. **For each check:**
   1. Write it the plainest way the language allows (see "Writing them in any language").
   2. Run it. If it fails on existing code, fix the code first, in its own commit, or list the case with its reason where the check allows one.
   3. **Break the code once on purpose** (add the thing the check forbids), see it fail, keep the failing line, put the code back.
   4. Commit the check after the fixes it forced, so every commit passes, with its failing line in the message.
4. **Start every list empty.** A check with an allow-list (shared writers, modules with a stated job) begins with nothing in it. Each entry is added when the check asks, with a reason in a sentence. An entry copied from another game is a decision nobody made.
5. **Report:** each check, the line it failed with when broken on purpose, and anything it found in the existing code.

A worked example in another repo or language is useful to read, not to copy: its names, its lists and its thresholds belong to its game.

## The checks

| # | Check | Fails when | Why |
| --- | --- | --- | --- |
| 1 | Zones | A zone imports one it may not: the rules import nothing from the game; the simulation imports neither the rules nor the seam; only the seam writes what the rules own | The rules stay small and testable only while nothing reaches into them |
| 2 | One tick order | A system isn't in the tick's order, or the architecture doc lists another order | A system every test ran and the game never did is the usual way a feature "works" and isn't there |
| 3 | No hand-built step lists | A test calls three or more systems in a row itself instead of stepping a subset of the tick order | A test that builds its own order tests a different game |
| 4 | Randomness is passed in | A system reaches a shared random source instead of taking the stream it was given | One new draw anywhere shifts every later draw for the same seed; one stream per job keeps them apart |
| 5 | No kind branches | A system compares an entity's kind (item type, enemy type, tile type) outside the definitions | A branch per kind is a missing component; data is behaviour |
| 6 | Shared writers are listed | A field is written from more than one module and isn't on the list with a reason | Safe reasons: one writer per kind of entity in a known order; one sets, another counts down; requests applied by one system. Anything else is debt and the list says so |
| 7 | Modules state their job | A simulation module writes more than a few kinds of component, or runs long, and its one-sentence job isn't listed; or a listed one no longer needs it | Asks instead of failing: a sentence you can't write honestly is the split |
| 8 | No file names in comments | A comment names a source file | Where things live goes stale the moment code moves; comments say why |
| 9 | Docs drift | A name the architecture doc or glossary mentions doesn't exist in the code, or a rules example names a test that doesn't exist | The docs are part of the contract |
| 10 | Mutations are current | A mutation entry's text isn't in its file exactly once, or its tests don't exist | The full mutation run is too slow for every check; this part is fast and catches the rot a refactor causes |
| 11 | Vocabularies agree | The simulation has a member (a kind, a perk, a door) that the rules' table of names has no entry for | Names cross the seam through one table per vocabulary; a member missing from it is a name the rules can't speak |

Two tools sit next to the checks, run by hand rather than with the tests:

- **A mutation runner.** A list of entries (name, file, exact text, replacement, tests that must catch it). For each: copy the file aside, replace the text, run those tests, restore the file from the copy. A mutation is caught when the test command **exits non-zero**: judge by the exit code, never by parsing the summary. If a run catches nothing, or everything, break one thing by hand before trusting it. Rerun it after every refactor.
- **A stage report.** From git alone: the files changed since a ref with their lines before and after, and how many of the last N commits touched each file. Language-independent.

## Writing them in any language

Most checks read the source **as text, from inside the test runner**, so they run with every other test and need no extra tool. A regex is enough to start; switch to the language's own parser when a check gives false hits (a write through an alias, a comment inside a string). Every check needs the same three things: list the source files, read each one, collect what breaks the rule and assert the collection is empty, so the failure message is the list itself.

| Need | TypeScript | Go | Java | Rust |
| --- | --- | --- | --- | --- |
| Read source in a test | `import.meta.glob('./**/*.ts', { query: '?raw', eager: true })` in Vite, or `fs` | `filepath.WalkDir` + `os.ReadFile`; `go/parser` + `go/ast` when text isn't enough | `Files.walk` over `src/main/java`; JavaParser when text isn't enough | an integration test walking `src/` with `std::fs`; `syn` when text isn't enough |
| Zones (check 1) | dependency-cruiser rules | one package per zone; a test over `go list -deps -json`, or `depguard` | ArchUnit layer rules, or one module per zone | one crate per zone in a workspace: the compiler enforces it |
| Tick order as data (2, 3) | an array of `[name, system]`; `stepper(names)` runs the named ones in that order | a slice of `struct{ Name string; Run func(dt) }` | a `List<Map.Entry<String, System>>` or an enum of systems | a `const` slice of `(&str, fn(...))` |
| Randomness passed in (4) | a `Random` interface, one seeded stream per job, passed as a parameter | an interface with `Float64()`; one `rand.New(rand.NewPCG(...))` per job | `RandomGenerator`; one `SplittableRandom` per job | a trait object or generic `R: Rng`; one `StdRng::seed_from_u64` per job |
| Kind branches (5) | `=== Kind.` outside the definitions | `case Kind…` / `== Kind…` outside the definitions | `== Kind.` / `case` on the kind enum outside the definitions | `match` / `==` on the kind enum outside the definitions |
| Who writes a field (6, 7) | `Component.field[...] =` | `components.Field[i] =` | `component.field[i] =` | `component.field[i] =`; with a borrow checker, also a `&mut` taken by a system |
| Mutation runner command | `npx vitest run <tests>` | `go test ./... -run <tests>` | `mvn -q test -Dtest=<tests>` or `gradle test --tests <tests>` | `cargo test <tests>` |

The tick-order check (2) compares two lists: every exported or registered system against the tick order, and the tick order against the order the architecture doc lists. Systems are found by naming convention (`...System`) or by a registry; pick whichever the code already has, and make the convention itself a rule in the zone's instructions.

## Signs a check is wrong

- **It has never failed.** Break the code on purpose; if it still passes, it's blind.
- **It fails on something nobody would call a problem,** and the fix is to bend the code to the check. Narrow the check instead.
- **Its allow-list keeps growing with the same reason.** The reason is a pattern: make it part of the check, or make it a component.
- **It passes because the regex missed** (a write through a helper, a renamed import). Note the blind spot next to the check; move to the parser if it starts to matter.

## Checklist

- [ ] Run after the first feature, or for a check a retro added.
- [ ] Each check written for this code, and every list started empty.
- [ ] Each check broken once on purpose; the failing line kept.
- [ ] Each check committed after the fixes it forced, with its failing line in the message.
- [ ] Mutation runner and stage report in the repo; the runner judged by exit code.
