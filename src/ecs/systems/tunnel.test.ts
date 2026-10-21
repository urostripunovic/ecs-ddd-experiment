import { beforeEach, describe, expect, it } from 'vitest';

import { DOORS } from '../arenas';
import { Arena, PlayerInput, resetArenaState, resetRunState, RunStatus, Transform } from '../components';
import { RunViewWritable } from '../components/run-view';
import { clearOutbox, outbox } from '../core/outbox';
import { inSeconds, ticks } from '../core/units';
import { resetWorld, world, type EntityId } from '../core/world';
import { spawnPlayer } from '../prefabs';
import { bodyCollisionSystem } from './collision';
import { inputSystem, movementSystem } from './motion';
import { DoorNumber, tunnelSystem } from './tunnel';

const DT = inSeconds(ticks(1));
let player: EntityId;

// Walks the player north from x for five seconds, then reports where they got
// and which doors the sensor reported.
function walkNorthAt(x: number): { z: number; doors: number[] } {
  Transform.x[player] = x;
  Transform.z[player] = 0;
  PlayerInput.moveX = 0;
  PlayerInput.moveZ = -1;
  const doors: number[] = [];
  for (let i = 0; i < 300; i++) {
    inputSystem();
    movementSystem(DT);
    bodyCollisionSystem();
    tunnelSystem();
    for (let j = 0; j < outbox.count; j++) if (outbox.slots[j].kind === 'TunnelEntered') doors.push(outbox.slots[j].value);
    clearOutbox();
    world.tick++;
  }
  return { z: Transform.z[player], doors };
}

beforeEach(() => {
  resetWorld();
  resetArenaState();
  resetRunState();
  clearOutbox();
  RunViewWritable.status = RunStatus.Cleared;
  player = spawnPlayer(0, 0);
});

describe('the doors in the north wall', () => {
  it('sit apart, so a body in one corridor is never in the other', () => {
    expect(Math.abs(DOORS.final.x - DOORS.onward.x)).toBeGreaterThan(2 * DOORS.halfWidth + 2);
    expect(Math.abs(DOORS.final.x) + DOORS.halfWidth).toBeLessThan(Arena.half - 1);
  });

  it('let you through only the onward one when only it is open, reported as onward, once', () => {
    RunViewWritable.tunnelOpen = true;
    RunViewWritable.finalDoorOpen = false;
    expect(walkNorthAt(DOORS.onward.x).doors).toEqual([DoorNumber.Onward]);
    resetWorld(); player = spawnPlayer(0, 0);
    const blocked = walkNorthAt(DOORS.final.x);
    expect(blocked.doors).toEqual([]);
    expect(blocked.z).toBeGreaterThanOrEqual(-Arena.half);
  });

  it('let you through either when both are open, each reported as itself', () => {
    RunViewWritable.tunnelOpen = true;
    RunViewWritable.finalDoorOpen = true;
    expect(walkNorthAt(DOORS.final.x).doors).toEqual([DoorNumber.Final]);
    resetWorld(); player = spawnPlayer(0, 0);
    expect(walkNorthAt(DOORS.onward.x).doors).toEqual([DoorNumber.Onward]);
  });

  it('let you through only the final one when it is the only way on', () => {
    RunViewWritable.tunnelOpen = false;
    RunViewWritable.finalDoorOpen = true;
    expect(walkNorthAt(DOORS.onward.x).doors).toEqual([]);
    resetWorld(); player = spawnPlayer(0, 0);
    expect(walkNorthAt(DOORS.final.x).doors).toEqual([DoorNumber.Final]);
  });

  it('keep you inside the corridor you walked into', () => {
    RunViewWritable.tunnelOpen = true;
    RunViewWritable.finalDoorOpen = true;
    walkNorthAt(DOORS.final.x);
    PlayerInput.moveX = -1;
    PlayerInput.moveZ = 0;
    for (let i = 0; i < 120; i++) { inputSystem(); movementSystem(DT); bodyCollisionSystem(); world.tick++; }
    expect(Transform.x[player]).toBeGreaterThanOrEqual(DOORS.final.x - DOORS.halfWidth);
  });
});
