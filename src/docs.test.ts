import { describe, expect, it } from 'vitest';

// The docs are part of the contract: an agent reads them before changing the
// game. These checks catch docs that name things the code no longer has (the
// boss phase stayed "domain-owned" in the docs for a commit after it moved).
// They can't prove the meaning matches; they make the easy drift loud.
const docs = import.meta.glob<string>('../docs/*.md', { query: '?raw', import: 'default', eager: true });
const code = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });
const tests = Object.fromEntries(Object.entries(code).filter(([p]) => p.endsWith('.test.ts')));
const source = Object.entries(code)
  .filter(([p]) => !p.endsWith('.test.ts'))
  .map(([, s]) => s)
  .join('\n');

const doc = (name: string) => docs[`../docs/${name}`];

// Code names the docs mention: `BossDefeated`, `RunView.status`, `after()`.
// Anything with a space, a slash or a file extension is prose or a path.
function namesIn(markdown: string): string[] {
  const names = new Set<string>();
  for (const [, inner] of markdown.matchAll(/`([^`]+)`/g)) {
    if (/[\s/]|\.ts$|\.md$|\.test\b/.test(inner)) continue;
    const name = inner.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (name && name.length > 2) names.add(name);
  }
  return [...names];
}

const EXAMPLES_HEADER = '| # | Area | State | Request | Facts | Status | Test |';
const STATUSES = ['accepted', 'experimental', 'open'];

function examplesRows(): string[][] {
  const lines = doc('ARCHITECTURE.md').split('\n');
  const start = lines.indexOf(EXAMPLES_HEADER);
  const rows: string[][] = [];
  for (let i = start + 2; start >= 0 && i < lines.length && lines[i].startsWith('|'); i++) {
    rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

describe('docs match the code', () => {
  for (const name of ['ARCHITECTURE.md', 'GLOSSARY.md']) {
    it(`every code name in ${name} exists in the source`, () => {
      const missing = namesIn(doc(name)).filter((n) => !new RegExp(`\\b${n}\\b`).test(source));
      expect(missing).toEqual([]);
    });
  }

  it('the rules examples table has the agreed columns', () => {
    expect(examplesRows().length).toBeGreaterThan(0);
  });

  it('every examples row has a status, and the tests it names exist', () => {
    const problems: string[] = [];
    for (const [id, , state, , , status, test] of examplesRows()) {
      if (state.startsWith('(removed')) continue;
      if (!STATUSES.includes(status)) problems.push(`${id}: status "${status}"`);
      // "`run.test`: going down after the clear; `flow.test`: both outbox orders"
      for (const [, file, title] of test.matchAll(/`([\w.-]+)`:\s*([^;`]+)/g)) {
        const hits = Object.entries(tests).filter(([p]) => p.endsWith(`/${file}.ts`));
        const named = hits.some(([, src]) => src.toLowerCase().includes(title.trim().toLowerCase()));
        if (!named) problems.push(`${id}: no test "${title.trim()}" in ${file}`);
      }
      if (status === 'accepted' && !/`[\w.-]+`:/.test(test)) problems.push(`${id}: accepted but no test named`);
    }
    expect(problems).toEqual([]);
  });
});
