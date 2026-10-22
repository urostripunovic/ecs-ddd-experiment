#!/usr/bin/env python3
"""What a stage did to the code, for the end-of-stage report.

  python3 tools/report.py [since] [--recent N]

Two tables. "This stage": every source file changed since `since` (a commit,
tag or branch; default: the last commit on origin/main), with its lines then
and now. "Churn": how many of the last N commits touched each source file.
A file that grows in every stage, or that commits for unrelated features keep
touching, is the one to ask "does this still have one job?" about. Neither
table is a verdict; read them next to the one-job check in the structure test.
"""
import subprocess
import sys
from collections import Counter


def git(*args: str) -> str:
    return subprocess.run(['git', *args], capture_output=True, text=True, check=True).stdout


def lines_at(ref: str, path: str) -> int:
    try:
        return git('show', f'{ref}:{path}').count('\n')
    except subprocess.CalledProcessError:
        return 0


def is_source(path: str) -> bool:
    return path.startswith('src/') and path.endswith('.ts') and not path.endswith('.test.ts')


def main() -> None:
    args = sys.argv[1:]
    recent = 20
    if '--recent' in args:
        i = args.index('--recent')
        recent = int(args[i + 1])
        del args[i:i + 2]
    since = args[0] if args else 'origin/main'

    changed = [p for p in git('diff', '--name-only', since).split() if is_source(p)]
    rows = [(p, lines_at(since, p), lines_at('HEAD', p)) for p in changed]
    rows.sort(key=lambda r: r[2] - r[1], reverse=True)
    print(f'This stage (since {since}): {len(rows)} source files changed')
    print(f'{"before":>7} {"after":>7} {"grew":>6}  file')
    for path, before, after in rows:
        print(f'{before:>7} {after:>7} {after - before:>+6}  {path}')

    touched = Counter()
    for commit in git('log', f'-{recent}', '--format=%H').split():
        for path in set(git('show', '--name-only', '--format=', commit).split()):
            if is_source(path):
                touched[path] += 1
    print(f'\nChurn: source files touched by most of the last {recent} commits')
    for path, count in touched.most_common(10):
        print(f'{count:>7}  {path}')


if __name__ == '__main__':
    main()
