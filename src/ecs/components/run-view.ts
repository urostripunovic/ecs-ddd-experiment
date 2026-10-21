// The writable side of RunView, the rules' run shown to the world. Only bridge/
// (the run projector and the spawn projection) and tests may import this file;
// .dependency-cruiser.cjs enforces it. Everyone else gets RunView from
// components/index.ts, typed read-only, so a stray write doesn't compile.
// tunnelOpen is the onward door; final: this arena is the final boss's.
export const RunViewWritable = {
  status: 0 as number, endedAt: 0, arena: 1, final: false, tunnelOpen: false, finalDoorOpen: false, revives: 0, seed: 1,
};
