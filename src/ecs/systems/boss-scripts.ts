// The boss scripts, one module per job (boss-scripts/). Re-exported here so the
// phase table, the renderer and the tests keep one place to import them from.
export { AIMED_SPEED, BURST_SPEED } from './boss-scripts/moves';
export { RING, ring, RING_BULLETS, RING_GAP_HALF, RING_GAPS, RING_SPEED, RING_TURN, SPIRAL_ARMS } from './boss-scripts/patterns';
export { keeperOne, keeperThree, keeperTwo, phaseOne, phaseTwo, unchainedOne, unchainedTwo } from './boss-scripts/handmade';
export { procedural } from './boss-scripts/procedural';
