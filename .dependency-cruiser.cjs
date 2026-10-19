// The three zones only work if nobody (human or agent) can quietly import across them.
// A failed lint is cheaper than a review comment.
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'domain/ is pure TS: no ECS, no bridge, no app, no engine.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: ['^src/(ecs|bridge|app)/', 'node_modules/three'] },
    },
    {
      name: 'ecs-knows-no-domain',
      comment: 'ecs/ is the simulation; it never sees aggregates or the bridge.',
      severity: 'error',
      from: { path: '^src/ecs/' },
      to: { path: ['^src/(domain|bridge|app)/', 'node_modules/three'] },
    },
    {
      name: 'bridge-is-headless',
      comment: 'bridge/ joins domain and ecs; rendering and input stay in app/.',
      severity: 'error',
      from: { path: '^src/bridge/' },
      to: { path: ['^src/app/', 'node_modules/three'] },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.js'] },
  },
};
