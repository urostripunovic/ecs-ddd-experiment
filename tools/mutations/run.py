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
import json, os, shutil, subprocess, sys

# (what it breaks, file, exact text to replace, replacement, tests to run)
# One deliberate bug per entry, and the tests that must catch it. Kept as data,
# so a test (structure.test) can check every entry still finds its text after
# a refactor: a moved file used to turn an entry into a silent skip.
M = json.load(open(os.path.join(os.path.dirname(__file__), 'mutations.json')))
bad = []
for m in M:
    name, path, old, new, tests = m['name'], m['file'], m['find'], m['replace'], ' '.join(m['tests'])
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
