// The hall itself: floor, walls, the tunnel and the gates. Built once per scene.
import * as THREE from 'three';
import { Arena } from '../../ecs/components';
import { DOORS } from '../../ecs/arenas';
import { cast, COLOR, shaded } from './meshes';

export function buildArena(scene: THREE.Scene): void {
  const size = Arena.half * 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), shaded(COLOR.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Greybox grid: 2 m squares make distances readable while tuning.
  const grid = new THREE.GridHelper(size, size / 2, 0x5d6168, 0x52565c);
  grid.position.y = 0.01;
  scene.add(grid);

  const wallMat = shaded(COLOR.wall);
  const h = 1.2;
  const t = 0.6;
  // The north wall has a gap for each door; the gates (drawn per frame) fill them.
  const gap = DOORS.halfWidth;
  const doorXs = [DOORS.onward.x, DOORS.final.x];
  const edges = [-Arena.half - t, ...doorXs.flatMap((x) => [x - gap, x + gap]), Arena.half + t];
  const walls: number[][] = [
    [0, Arena.half + t / 2, size + t * 2, t],
    [-Arena.half - t / 2, 0, t, size],
    [Arena.half + t / 2, 0, t, size],
  ];
  for (let i = 0; i < edges.length; i += 2) {
    walls.push([(edges[i] + edges[i + 1]) / 2, -Arena.half - t / 2, edges[i + 1] - edges[i], t]);
  }
  for (const x of doorXs) {
    // Each corridor's sides.
    walls.push([x - gap - t / 2, -Arena.half - DOORS.depth / 2, t, DOORS.depth]);
    walls.push([x + gap + t / 2, -Arena.half - DOORS.depth / 2, t, DOORS.depth]);
  }
  for (const [x, z, w, d] of walls) {
    const wall = cast(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat));
    wall.position.set(x, h / 2, z);
    scene.add(wall);
  }
  // Fading to black down each corridor: you walk into the dark, and come out in
  // the next arena. The final's ends in the Keeper's red, so it reads as the end.
  for (const [x, end] of [[DOORS.onward.x, 0x000000], [DOORS.final.x, COLOR.bossFinal]]) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(gap * 2, DOORS.depth), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.005, -Arena.half - DOORS.depth / 2);
    scene.add(floor);
    const back = new THREE.Mesh(new THREE.BoxGeometry(gap * 2 + t * 2, 4, 0.5), new THREE.MeshBasicMaterial({ color: end }));
    back.position.set(x, 2, -Arena.half - DOORS.depth);
    scene.add(back);
  }
}

export const GATE_HEIGHT = 1.6;

export function buildGate(scene: THREE.Scene, x: number, color: number): THREE.Mesh {
  const gate = cast(new THREE.Mesh(new THREE.BoxGeometry(DOORS.halfWidth * 2, GATE_HEIGHT, 0.5), shaded(color)));
  gate.position.set(x, GATE_HEIGHT / 2, -Arena.half - 0.25);
  scene.add(gate);
  return gate;
}
