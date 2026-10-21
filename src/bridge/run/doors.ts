import type { Doors } from '../../domain/run/run';

// Which of the two doors in the north wall stand open, for the doors a clear opened.
export function openDoors(doors: Doors | null): { onward: boolean; final: boolean } {
  return { onward: doors === 'onward' || doors === 'both', final: doors === 'final' || doors === 'both' };
}
