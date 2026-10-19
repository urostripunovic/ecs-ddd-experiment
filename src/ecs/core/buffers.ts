import { MAX } from './world';

// Shared query buffers. A system may only use `buf` for its own outer loop;
// anything it calls while iterating (scripts, helpers) needs its own buffer,
// or it would overwrite the list being walked.
export const buf = new Int32Array(MAX);
export const targetBuf = new Int32Array(MAX);
export const solidBuf = new Int32Array(MAX);
export const scriptBuf = new Int32Array(MAX);
export const itemBuf = new Int32Array(MAX);
// For small helpers that may be called from inside any system's loop.
export const helperBuf = new Int32Array(MAX);
