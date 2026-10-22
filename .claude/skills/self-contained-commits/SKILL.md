---
name: self-contained-commits
description: Use when committing or preparing to push: each commit does one thing, builds and passes alone, carries its own fixes, and every edit (scripted ones above all) is checked by its diff before it's committed.
---

# Self-contained commits

A history is read by reviewers, by `git bisect`, and by whoever reverts something at 2 a.m. Each of them assumes every commit works and does one thing. This skill keeps that true.

## Each commit does one thing

- **One change a reviewer can name in a line:** a refactor, a behaviour, a check, a docs update. A refactor never rides along with a behaviour change: "no behaviour change" has to be checkable.
- **Split cross-cutting work by layer** (data access, services, API, tests, docs) where each layer's commit stands alone. When a lower layer changes something the next one needs to compile, they're one commit.
- **A new check goes in after the fixes it forces,** so every commit passes; put the check's first failing output in its message, so the history shows what it caught.

## Each commit builds and passes alone

Before pushing, prove it for each commit, not just the last one:

```sh
git rebase -x '<build and test command>' origin/main
```

While committing part of a working tree, stash the rest and run the checks on exactly what's staged:

```sh
git stash push --keep-index
<build and test command>
git stash pop
```

## A fix belongs to the commit that introduced the bug

- **Found before pushing:** fold it in, never a "fix" commit three commits later.
  ```sh
  git commit --fixup <sha>
  git rebase -i --autosquash <sha>~1   # or GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <sha>~1 where interactive editors aren't available
  ```
- **Found after the commit is shared:** a new commit that names the one it fixes ("Fixes abc1234: …"). Never rewrite shared history.

## Check every edit by its diff, before reading it

Edits made by a script, a search-and-replace, a formatter or a JSON round-trip can do more than you meant: strip names, glue a comment onto the wrong line, or reformat a whole file to change a few lines. Before committing:

1. **Say what you expect:** which files, roughly how many lines.
2. **Read `git diff --stat` first.** It costs a few lines of output.
3. **If the numbers match, read the diff.** If they don't (thousands of lines for a seven-line change, a file you never meant to touch), stop: revert, fix the script, redo. Don't read the big diff to find out why; the numbers already said it's wrong.
4. **Prefer edits that preserve formatting:** a text substitution over parse-and-rewrite of a data file.

This catches a wrong edit before it costs anything, and you only pay for reading a diff once you know it's the one you meant to make.

## The message says why

- **Subject:** what changed, in the imperative, under about 70 characters.
- **Body:** why, what was decided and with whom, and evidence: a test's failing line from before the change, a check's first output.
- **No narration of steps,** no file lists the diff already shows.

## Push when the series is tidy

Push a feature once its commits are clean, not commit by commit. Re-read the log as a reviewer would (`git log --oneline origin/main..`): one line per commit should tell the story.

## Checklist

- [ ] Every commit does one thing and its subject names it.
- [ ] Every commit builds and passes alone (`git rebase -x`).
- [ ] Fixes are folded into the commits that introduced the bugs.
- [ ] Every scripted edit's `--stat` matched what was meant before its diff was read.
- [ ] Messages say why, with evidence.
