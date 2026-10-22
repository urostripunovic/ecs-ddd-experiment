import { describe, expect, it } from 'vitest';

// A rule written into two skills drifts like a name written into two tables:
// one copy gets the fix, the other keeps teaching the old rule. So each rule's
// body lives in one skill, and the others carry its headline and a pointer.
// Eight words in a row is a copied rule; six catches shared phrases too.
const skills = import.meta.glob<string>('../.claude/skills/*/SKILL.md', { query: '?raw', import: 'default', eager: true });
const RUN = 8;

function words(markdown: string): string[] {
  const body = markdown.replace(/^---[\s\S]*?---/, '');
  return body.toLowerCase().replace(/[`*_|#>[\]()]/g, ' ').split(/[^a-z0-9'’-]+/).filter(Boolean);
}

function runs(markdown: string): Set<string> {
  const list = words(markdown);
  const out = new Set<string>();
  for (let start = 0; start + RUN <= list.length; start++) out.add(list.slice(start, start + RUN).join(' '));
  return out;
}

const skillName = (path: string) => path.split('/').at(-2) ?? path;

describe('skills', () => {
  it('finds the skills', () => {
    expect(Object.keys(skills).length).toBeGreaterThan(1);
  });

  it('never carries the same rule body in two skills', () => {
    const entries = Object.entries(skills).map(([path, text]) => [skillName(path), runs(text)] as const);
    const shared: string[] = [];
    for (let first = 0; first < entries.length; first++) {
      for (let second = first + 1; second < entries.length; second++) {
        const [nameA, runsA] = entries[first];
        const [nameB, runsB] = entries[second];
        const common = [...runsA].filter((run) => runsB.has(run));
        if (common.length > 0) shared.push(`${nameA} and ${nameB}: "${common[0]}…" (${common.length} runs)`);
      }
    }
    expect(shared).toEqual([]);
  });
});
