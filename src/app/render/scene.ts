// Reads components only. Nothing here can change the simulation.
import * as THREE from 'three';
import {
  Arena, BossAction, BossGen, BossPhase, BossStyle, Burn, C, Collider, Hurt, Jump, Line, LineState, Orbit, Pattern, PerkPickup, PlayerInput, Revive, RewardPickup, RunView, Shake, Shape,
  ShapeKind, Slam, Spikes, StuckIn, Tracer, Transform, Velocity, Wielder,
} from '../../ecs/components';
import { WEAPONS, WeaponKind } from '../../ecs/weapons/defs';
import { BossStyleKind } from '../../ecs/bosses/defs';
import { DOORS } from '../../ecs/arenas';
import { Action, CONE_WINDUP, SPIRAL_WINDUP } from '../../ecs/systems/boss-actions';
import { RING_GAP_HALF, RING_GAPS, SPIRAL_ARMS } from '../../ecs/systems/boss-scripts';
import { dizzy, dodging } from '../../ecs/systems/status';
import { CHARGE_MAX_TICKS } from '../../ecs/weapons/charge';
import { bossPose } from './boss-pose';
import { follow, type Follow } from './camera';
import { handleAt, has, indexOf, isLive, MAX_ENTITIES, NOBODY, world, type EntityId, type Handle } from '../../ecs/core/world';

const COLOR = {
  bg: 0x1b1c1e,
  floor: 0x45484d,
  wall: 0x5b5f66,
  pillar: 0x6d7178,
  player: 0x7fb2d9,
  boss: 0x8f8c87,
  bossEnraged: 0xa45a43,
  bossFinal: 0xc23a2a,
  bullet: 0xffd65c,
  enemyBullet: 0xff6b3d,
  telegraph: 0xd9573b,
  dead: 0x2f3134,
  steel: 0xc9ced6,
  wood: 0x9c7a52,
  gun: 0x3b4048,
  haste: 0x5fd39a,
  fury: 0xe8584a,
  spiked: 0x8a4f45,
  safe: 0x6fd3b0,
  heavyBullet: 0xfff1a8,
  rail: 0x8fe8ff,
  orb: 0xc77dff,
  beam: 0xff4fd8,
  flame: 0xff8a2a,
  burning: 0x7a2c00,
};
// One colour per perk (Perk in ecs/systems/perks.ts), so a pickup says what it is from across the arena.
// A procedural boss's body, by Body: the Colossus stone-grey, the Lancer bronze, the Sentinel violet.
const BODY_COLOR = [0x7c7a74, 0x9a7a4e, 0x6f6596];
const PERK_COLOR = [0xffffff, 0xe8584a, 0x5fd39a, 0xffd65c, 0x9fb7ff, 0xd99cff];
// One per RewardKind: revive, armor, heal, Scattergun.
const REWARD_COLOR = [0xffffff, 0xff7aa8, 0x9fb7ff, 0x5fd39a, 0xffb347];
// Ticks for spikes to grow out, so the roar's threat is visible before it bites.
const SPIKE_GROW_TICKS = 40;
const SPIKES_PER_RING = 8;

const SWING_TICKS = 10;
// Rings have at most four gaps, spirals at most four arms.
const MAX_WEDGES = 4;

// Two sines at unrelated rates: smooth, so the shake rolls instead of jittering.
// Render-only, so it may be anything; it never reaches the simulation.
const wobble = (x: number, seed: number) => (Math.sin(x + seed * 12.9) + Math.sin(x * 1.7 + seed * 4.1)) * 0.5;
const shakeOffset = new THREE.Vector3(); // matches the attack system; only used to time the animation
const HAND_HEIGHT = 0.9;

const CAMERA_OFFSET = new THREE.Vector3(0, 26, 16);
// Leading the aim a little shows more of where you are shooting than where you have been.
const LOOK_AHEAD = 3;
const AIM_HEIGHT = 0.9; // bullets fly at this height, so aim on the same plane

type Visual = THREE.Object3D & {
  userData: {
    mat?: THREE.MeshStandardMaterial; base?: number; spikes?: THREE.Group;
    gem?: THREE.Mesh; gemMat?: THREE.MeshStandardMaterial;
  };
};

function shaded(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
}

function cast<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { c.castShadow = true; c.receiveShadow = true; });
  return o;
}

// Shared geometry; per-entity materials only where a hit flash needs its own colour.
const geo = {
  playerBody: new THREE.CapsuleGeometry(0.42, 0.7, 6, 14),
  visor: new THREE.BoxGeometry(0.5, 0.18, 0.3),
  bossBody: new THREE.BoxGeometry(2.4, 2.8, 2.4),
  bossCore: new THREE.BoxGeometry(1.0, 0.5, 0.2),
  bullet: new THREE.CapsuleGeometry(0.11, 0.7, 4, 8).rotateX(Math.PI / 2),
  enemyBullet: new THREE.SphereGeometry(0.24, 12, 10),
  pillar: new THREE.CylinderGeometry(1, 1, 3.2, 24),
  // Weapons point down local -z, the same way the player faces, so one yaw aims both.
  blade: new THREE.BoxGeometry(0.1, 0.05, 1.3).translate(0, 0, -0.85),
  guard: new THREE.BoxGeometry(0.42, 0.08, 0.08).translate(0, 0, -0.18),
  shaft: new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8).rotateX(Math.PI / 2).translate(0, 0, -0.7),
  tip: new THREE.ConeGeometry(0.1, 0.35, 10).rotateX(-Math.PI / 2).translate(0, 0, -2.05),
  gunBody: new THREE.BoxGeometry(0.18, 0.2, 0.62).translate(0, 0, -0.25),
  gunGrip: new THREE.BoxGeometry(0.14, 0.26, 0.14).translate(0, -0.18, 0),
  buff: new THREE.OctahedronGeometry(0.34),
  perk: new THREE.IcosahedronGeometry(0.42, 0),
  pedestal: new THREE.CylinderGeometry(0.7, 0.85, 0.6, 16),
  rewardGem: new THREE.OctahedronGeometry(0.5),
  scatterBody: new THREE.BoxGeometry(0.26, 0.22, 0.5).translate(0, 0, -0.2),
  scatterBarrel: new THREE.CylinderGeometry(0.09, 0.13, 0.4, 10).rotateX(Math.PI / 2).translate(0, 0.02, -0.62),
  heavyBullet: new THREE.CapsuleGeometry(0.3, 1.2, 4, 10).rotateX(Math.PI / 2),
  // Base at the origin, pointing +x, so scaling a spike grows it out of the pillar.
  spike: new THREE.ConeGeometry(0.16, 0.5, 8).translate(0, 0.25, 0).rotateZ(-Math.PI / 2),
  // A wedge centred on angle 0, flat on the floor: one ring gap.
  gap: new THREE.CircleGeometry(16, 12, -RING_GAP_HALF, RING_GAP_HALF * 2).rotateX(-Math.PI / 2),
  arm: new THREE.CircleGeometry(16, 4, -0.05, 0.1).rotateX(-Math.PI / 2),
  chakram: new THREE.TorusGeometry(0.36, 0.07, 6, 24).rotateX(Math.PI / 2),
  hammerHandle: new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8).rotateX(Math.PI / 2).translate(0, 0, -0.55),
  hammerHead: new THREE.BoxGeometry(0.62, 0.36, 0.36).translate(0, 0, -1.2),
  railBody: new THREE.BoxGeometry(0.16, 0.18, 1.0).translate(0, 0, -0.45),
  railCoil: new THREE.TorusGeometry(0.15, 0.04, 6, 16).translate(0, 0, -0.7),
  flamerTank: new THREE.CylinderGeometry(0.15, 0.15, 0.5, 12).rotateX(Math.PI / 2).translate(0, 0, -0.1),
  flamerNozzle: new THREE.CylinderGeometry(0.05, 0.08, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, -0.6),
  // A unit box stretched along local z between the beam's two ends each frame.
  beam: new THREE.BoxGeometry(1, 1, 1),
  orb: new THREE.SphereGeometry(0.42, 16, 12),
  // A charge's lane: a unit square on the floor, stretched along local z.
  lane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  // The flamethrower's reach and half-angle, from its definition, opening along -z.
  flame: (() => {
    const def = WEAPONS[WeaponKind.Flamethrower];
    const radius = def.reach * Math.tan(Math.acos(def.arcCos));
    return new THREE.ConeGeometry(radius, def.reach, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, -def.reach / 2);
  })(),
};
const railMat = new THREE.MeshStandardMaterial({ color: COLOR.rail, emissive: COLOR.rail, emissiveIntensity: 0.5, roughness: 0.3 });
const flameMat = new THREE.MeshBasicMaterial({
  color: COLOR.flame, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
});
const bulletMat = new THREE.MeshBasicMaterial({ color: COLOR.bullet });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: COLOR.enemyBullet });
const steelMat = new THREE.MeshStandardMaterial({ color: COLOR.steel, roughness: 0.35, metalness: 0.6 });
const woodMat = shaded(COLOR.wood);
const gunMat = shaded(COLOR.gun);

function weapon(...parts: [THREE.BufferGeometry, THREE.Material][]): Visual {
  const g = new THREE.Group() as Visual;
  for (const [geometry, material] of parts) g.add(new THREE.Mesh(geometry, material));
  return cast(g);
}

function buffVisual(color: number): Visual {
  const m = new THREE.Mesh(
    geo.buff,
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 }),
  ) as Visual;
  return cast(m);
}

function build(kind: number): Visual {
  switch (kind) {
    case ShapeKind.Player: {
      const mat = shaded(COLOR.player);
      const g = new THREE.Group() as Visual;
      const body = new THREE.Mesh(geo.playerBody, mat);
      body.position.y = 0.85;
      const visor = new THREE.Mesh(geo.visor, shaded(0x22313d));
      visor.position.set(0, 1.15, -0.38);
      g.add(body, visor);
      g.userData = { mat, base: COLOR.player };
      return cast(g);
    }
    case ShapeKind.Boss: {
      const mat = shaded(COLOR.boss);
      const g = new THREE.Group() as Visual;
      const body = new THREE.Mesh(geo.bossBody, mat);
      body.position.y = 1.4;
      const core = new THREE.Mesh(geo.bossCore, new THREE.MeshBasicMaterial({ color: COLOR.telegraph }));
      core.position.set(0, 2.0, 1.21);
      g.add(body, core);
      g.userData = { mat, base: COLOR.boss };
      // Yaw first, then pitch, so leaning back and forth follows the way it faces.
      g.rotation.order = 'YXZ';
      return cast(g);
    }
    case ShapeKind.Bullet: {
      const m = new THREE.Mesh(geo.bullet, bulletMat) as Visual;
      m.position.y = AIM_HEIGHT;
      return m;
    }
    case ShapeKind.EnemyBullet:
      return new THREE.Mesh(geo.enemyBullet, enemyBulletMat) as Visual;
    case ShapeKind.Pillar: {
      // Own material, so a spiked pillar can glow without tinting the rest.
      const mat = shaded(COLOR.pillar);
      const g = new THREE.Group() as Visual;
      const column = new THREE.Mesh(geo.pillar, mat);
      column.position.y = 1.6;
      const spikes = new THREE.Group();
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < SPIKES_PER_RING; i++) {
          const a = ((i + row * 0.5) / SPIKES_PER_RING) * Math.PI * 2;
          const spike = new THREE.Mesh(geo.spike, steelMat);
          spike.position.set(Math.cos(a), 0.9 + row * 1.3, Math.sin(a));
          spike.rotation.y = -a;
          spikes.add(spike);
        }
      }
      spikes.visible = false;
      g.add(column, spikes);
      g.userData = { mat, base: COLOR.pillar, spikes } as Visual['userData'];
      return cast(g);
    }
    case ShapeKind.Sword: return weapon([geo.blade, steelMat], [geo.guard, gunMat]);
    case ShapeKind.Spear: return weapon([geo.shaft, woodMat], [geo.tip, steelMat]);
    case ShapeKind.Gun: return weapon([geo.gunBody, gunMat], [geo.gunGrip, gunMat]);
    case ShapeKind.Scattergun: return weapon([geo.scatterBody, woodMat], [geo.scatterBarrel, gunMat], [geo.gunGrip, gunMat]);
    case ShapeKind.Chakram: return weapon([geo.chakram, steelMat]);
    case ShapeKind.Warhammer: return weapon([geo.hammerHandle, woodMat], [geo.hammerHead, gunMat]);
    case ShapeKind.Railgun: return weapon([geo.railBody, gunMat], [geo.railCoil, railMat], [geo.gunGrip, gunMat]);
    case ShapeKind.Flamethrower: return weapon([geo.flamerTank, shaded(COLOR.fury)], [geo.flamerNozzle, gunMat], [geo.gunGrip, gunMat]);
    case ShapeKind.Orb: {
      const m = new THREE.Mesh(
        geo.orb, new THREE.MeshStandardMaterial({ color: COLOR.orb, emissive: COLOR.orb, emissiveIntensity: 0.8, roughness: 0.3 }),
      ) as Visual;
      return m;
    }
    case ShapeKind.RailBeam: {
      const m = new THREE.Mesh(
        geo.beam, new THREE.MeshBasicMaterial({ color: COLOR.rail, transparent: true, opacity: 0.9, depthWrite: false }),
      ) as Visual;
      return m;
    }
    case ShapeKind.Reward: {
      const g = new THREE.Group() as Visual;
      const stand = new THREE.Mesh(geo.pedestal, shaded(0x55585e));
      stand.position.y = 0.3;
      const gemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.3 });
      const gem = new THREE.Mesh(geo.rewardGem, gemMat);
      gem.position.y = 1.4;
      g.add(stand, gem);
      g.userData = { gem, gemMat } as Visual['userData'];
      return cast(g);
    }
    case ShapeKind.Perk: {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.3 });
      return cast(new THREE.Mesh(geo.perk, mat)) as Visual;
    }
    case ShapeKind.HeavyBullet: {
      const m = new THREE.Mesh(geo.heavyBullet, new THREE.MeshBasicMaterial({ color: COLOR.heavyBullet })) as Visual;
      m.position.y = AIM_HEIGHT;
      return m;
    }
    case ShapeKind.Haste: return buffVisual(COLOR.haste);
    case ShapeKind.Fury: return buffVisual(COLOR.fury);
    default:
      return new THREE.Object3D() as Visual;
  }
}

function buildArena(scene: THREE.Scene): void {
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

const GATE_HEIGHT = 1.6;
function buildGate(scene: THREE.Scene, x: number, color: number): THREE.Mesh {
  const gate = cast(new THREE.Mesh(new THREE.BoxGeometry(DOORS.halfWidth * 2, GATE_HEIGHT, 0.5), shaded(color)));
  gate.position.set(x, GATE_HEIGHT / 2, -Arena.half - 0.25);
  scene.add(gate);
  return gate;
}

// A flat wedge pointing down +x, turned toward the player while a cone winds up.
const CONE_HALF_ANGLE = 0.4;
const CONE_LENGTH = 11;
function buildConeTelegraph(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(CONE_LENGTH, 24, -CONE_HALF_ANGLE, CONE_HALF_ANGLE * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: COLOR.telegraph, transparent: true, opacity: 0, depthWrite: false }),
  );
  m.position.y = 0.025;
  return m;
}

function buildTelegraph(): THREE.Group {
  const g = new THREE.Group();
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 1, 64),
    new THREE.MeshBasicMaterial({ color: COLOR.telegraph, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ color: COLOR.telegraph, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  edge.rotation.x = fill.rotation.x = -Math.PI / 2;
  edge.position.y = 0.03;
  fill.position.y = 0.02;
  g.add(edge, fill);
  g.userData.fill = fill;
  return g;
}

export type ArenaView = {
  render(alpha: number): void;
  // Where the cursor meets the aim plane, in world x/z. False if it misses.
  aimPoint(clientX: number, clientY: number, out: { x: number; z: number }): boolean;
};

export function createArenaView(host: HTMLElement, focus: () => Handle): ArenaView {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);
  scene.fog = new THREE.Fog(COLOR.bg, 40, 75);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  camera.position.copy(CAMERA_OFFSET);
  const lookAt = new THREE.Vector3();
  const cam: Follow = { x: 0, z: 0, focus: NOBODY };

  scene.add(new THREE.HemisphereLight(0xe4e8ee, 0x2a2b2e, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(14, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 70 });
  scene.add(sun);

  buildArena(scene);
  const gate = buildGate(scene, DOORS.onward.x, COLOR.telegraph);
  const finalGate = buildGate(scene, DOORS.final.x, COLOR.bossFinal);

  const flame = new THREE.Mesh(geo.flame, flameMat);
  flame.visible = false;
  scene.add(flame);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.3, 32),
    new THREE.MeshBasicMaterial({ color: COLOR.player, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  reticle.rotation.x = -Math.PI / 2;
  scene.add(reticle);

  // Visuals are pooled per shape and keyed by slot + generation, so a recycled
  // slot never inherits the previous occupant's mesh.
  const visuals: (Visual | null)[] = new Array(MAX_ENTITIES).fill(null);
  // Same width as world.generation, or a slot past 65,535 reuses would never match
  // and its mesh would be rebuilt every frame.
  const visualGen = new Uint32Array(MAX_ENTITIES);
  const visualKind = new Uint8Array(MAX_ENTITIES);
  const pools: Visual[][] = Object.values(ShapeKind).map(() => []);
  const telegraphs: (THREE.Group | null)[] = new Array(MAX_ENTITIES).fill(null);
  const cones: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  // Floor wedges: where a ring leaves its gaps, and where a spiral's arms start.
  const gapWedges: (THREE.Group | null)[] = new Array(MAX_ENTITIES).fill(null);
  const armWedges: (THREE.Group | null)[] = new Array(MAX_ENTITIES).fill(null);
  let highWater = 0;

  const release = (e: number) => {
    const v = visuals[e]!;
    scene.remove(v);
    pools[visualKind[e]].push(v);
    visuals[e] = null;
    if (telegraphs[e]) telegraphs[e]!.visible = false;
    if (cones[e]) cones[e]!.visible = false;
    if (gapWedges[e]) gapWedges[e]!.visible = false;
    if (armWedges[e]) armWedges[e]!.visible = false;
    if (lanes[e]) lanes[e]!.visible = false;
    if (arcs[e]) arcs[e]!.visible = false;
    if (beams[e]) beams[e]!.visible = false;
  };

  const acquire = (e: number, kind: number): Visual => {
    const v = pools[kind].pop() ?? build(kind);
    v.rotation.set(0, 0, 0);
    v.scale.setScalar(1);
    v.position.y = kind === ShapeKind.Bullet || kind === ShapeKind.EnemyBullet || kind === ShapeKind.HeavyBullet || kind === ShapeKind.Orb
      ? AIM_HEIGHT : 0;
    scene.add(v);
    visuals[e] = v;
    visualGen[e] = world.generation[e];
    visualKind[e] = kind;
    return v;
  };

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -AIM_HEIGHT);
  const hit = new THREE.Vector3();
  let lastTime = performance.now();

  function render(alpha: number): void {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    const t = now / 1000;
    lastTime = now;

    highWater = Math.max(highWater, world.nextFresh);
    for (let e = 0; e < highWater; e++) {
      const kind = world.inUse[e] && has(e as EntityId, C.Shape) ? Shape.kind[e] : 0;
      if (visuals[e] && (kind === 0 || visualGen[e] !== world.generation[e] || visualKind[e] !== kind)) release(e);
      if (kind === 0) continue;

      const v = visuals[e] ?? acquire(e, kind);
      v.position.x = Transform.px[e] + (Transform.x[e] - Transform.px[e]) * alpha;
      v.position.z = Transform.pz[e] + (Transform.z[e] - Transform.pz[e]) * alpha;

      const dead = has(e as EntityId, C.Dead);
      const mat = v.userData.mat;
      if (mat) {
        let color = v.userData.base!;
        if (kind === ShapeKind.Boss && BossStyle.kind[e] === BossStyleKind.Procedural) color = BODY_COLOR[BossGen.body[e]] ?? color;
        if (kind === ShapeKind.Boss && BossPhase.phase[e] >= 2) color = BossPhase.phase[e] >= 3 ? COLOR.bossFinal : COLOR.bossEnraged;
        if (dead) color = COLOR.dead;
        mat.color.setHex(color);
        // A dodge glows for exactly its invulnerable ticks, so you can learn the timing by eye.
        // Just revived: a pulsing warm glow for exactly the ticks nothing can hurt you.
        const shielded = kind === ShapeKind.Player && world.tick < Revive.shieldUntil[e];
        const glow = shielded ? (Math.sin(t * 18) > 0 ? 0x8a6a2a : 0x3a2a10)
          : kind === ShapeKind.Player && dodging(e as EntityId) ? 0x3a6a8a : 0x000000;
        // Burning shows as an ember glow under the hit flash, for exactly the burn's ticks.
        const burning = !dead && world.tick < Burn.until[e] ? (Math.sin(t * 25 + e) > 0 ? COLOR.burning : 0x4a1a00) : glow;
        mat.emissive.setHex(Hurt.flash[e] > 0 && !dead ? 0x777777 : burning);
      }

      if (kind === ShapeKind.Player) {
        v.rotation.y = Math.atan2(-PlayerInput.aimX, -PlayerInput.aimZ);
        v.rotation.z = dead ? Math.PI / 2 : 0;
        v.position.y = dead ? 0.42 : 0;
        // Ducked and stretched along the dash.
        const ducked = dodging(e as EntityId);
        v.scale.set(ducked ? 1.15 : 1, ducked ? 0.6 : 1, ducked ? 1.15 : 1);
        // Dizzy: swaying, so you know why your feet won't listen.
        if (!dead && dizzy(e as EntityId)) { v.rotation.z = Math.sin(t * 7) * 0.25; v.rotation.x = Math.cos(t * 5) * 0.2; }
        else v.rotation.x = 0;
      } else if (kind === ShapeKind.Boss) {
        const slamming = has(e as EntityId, C.Slam);
        const winding = slamming ? 1 - Slam.timer[e] / Slam.windup[e] : 0;
        const elapsed = world.tick - BossAction.startedAt[e] + alpha;
        const pose = bossPose(
          dead ? Action.Idle : BossAction.kind[e], elapsed, winding, Jump.fromHeight[e], BossAction.windup[e],
          Line.state[e] === LineState.Stunned,
        );
        // Waiting on a perch before its first move: up there, not inside the pillar.
        const perched = BossAction.kind[e] === Action.Idle && has(e as EntityId, C.Airborne) ? Jump.fromHeight[e] : 0;
        v.position.y = dead ? -0.9 : pose.height || perched;
        v.rotation.z = dead ? 0.25 : 0;
        v.rotation.x = pose.lean;
        if (!dead) faceFocus(v);
        v.scale.set(pose.sx, pose.sy, pose.sx);
        drawTelegraph(e, winding);
        const windup = BossAction.windup[e];
        drawCone(e, !dead && BossAction.kind[e] === Action.Cone && elapsed < (windup || CONE_WINDUP), elapsed / (windup || CONE_WINDUP));
        const ringing = BossAction.kind[e] === Action.Ring || BossAction.kind[e] === Action.Storm || BossAction.kind[e] === Action.Combo;
        drawWedges(e, gapWedges, gapShape(Pattern.gapHalf[e] || RING_GAP_HALF), COLOR.safe, Pattern.gaps[e] || RING_GAPS, !dead && ringing);
        drawWedges(
          e, armWedges, geo.arm, COLOR.telegraph, Pattern.arms[e] || SPIRAL_ARMS,
          !dead && BossAction.kind[e] === Action.Spiral && elapsed < (windup || SPIRAL_WINDUP),
        );
        drawLine(e, dead ? Action.Idle : BossAction.kind[e], elapsed, windup);
      } else if (kind === ShapeKind.Reward) {
        const color = REWARD_COLOR[RewardPickup.kind[e]] ?? 0xffffff;
        v.userData.gemMat!.color.setHex(color);
        v.userData.gemMat!.emissive.setHex(color);
        v.userData.gem!.position.y = 1.4 + Math.sin(t * 2 + e) * 0.15;
        v.userData.gem!.rotation.y = t * 1.5;
      } else if (kind === ShapeKind.Perk) {
        // Coloured by what it grants, and turning on two axes so it never reads as a buff.
        const mat = (v as THREE.Mesh).material as THREE.MeshStandardMaterial;
        const color = PERK_COLOR[PerkPickup.kind[e]] ?? 0xffffff;
        mat.color.setHex(color);
        mat.emissive.setHex(color);
        v.position.y = 1 + Math.sin(t * 2.4 + e) * 0.2;
        v.rotation.set(t * 1.3, t * 1.9, 0);
      } else if (kind === ShapeKind.Bullet || kind === ShapeKind.HeavyBullet) {
        // A tracer reads far better than a dot at this camera distance.
        v.rotation.y = Math.atan2(Velocity.x[e], Velocity.z[e]);
      } else if (kind === ShapeKind.Pillar) {
        const r = Collider.radius[e];
        v.scale.set(r, 1, r);
        // Orbiting pillars turn as they go round, so the motion reads even without spikes.
        if (has(e as EntityId, C.Orbiting)) v.rotation.y = -Orbit.angle[e] * 2;
        const spiked = has(e as EntityId, C.Spiked);
        const grow = spiked ? Math.min(1, (world.tick - Spikes.since[e] + alpha) / SPIKE_GROW_TICKS) : 0;
        const spikes = v.userData.spikes!;
        spikes.visible = grow > 0;
        for (const spike of spikes.children) spike.scale.setScalar(Math.max(0.001, grow));
        if (spiked) mat!.color.setHex(COLOR.spiked);
      } else if (kind === ShapeKind.RailBeam) {
        // Stretched between its two ends, at shot height, and fading out over its life.
        const x0 = Transform.x[e];
        const z0 = Transform.z[e];
        const dx = Tracer.x1[e] - x0;
        const dz = Tracer.z1[e] - z0;
        v.position.set(x0 + dx / 2, AIM_HEIGHT, z0 + dz / 2);
        v.rotation.y = Math.atan2(dx, dz);
        const left = Math.max(0, Tracer.until[e] - world.tick - alpha);
        v.scale.set(0.08 + left * 0.02, 0.08 + left * 0.02, Math.hypot(dx, dz));
        ((v as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, left / 6);
      } else if (kind === ShapeKind.Haste || kind === ShapeKind.Fury) {
        v.position.y = 0.8 + Math.sin(t * 3 + e) * 0.15;
        v.rotation.y = t * 2;
      } else if (has(e as EntityId, C.Stuck)) {
        // Lodged in the boss's side at chest height, pointing in.
        const a = StuckIn.angle[e];
        v.position.y = 1.6;
        v.rotation.set(0.35, Math.atan2(Math.cos(a), Math.sin(a)), 0);
        v.scale.setScalar(1);
      } else if (has(e as EntityId, C.Flying)) {
        v.position.y = HAND_HEIGHT;
        const yaw = Math.atan2(-Velocity.x[e], -Velocity.z[e]);
        // A spear flies point first; anything else tumbles (a chakram spins flat, which is the same turn).
        v.rotation.y = kind === ShapeKind.Spear ? yaw : t * 22;
        v.scale.setScalar(1);
      } else if (has(e as EntityId, C.Grounded)) {
        // Lying flat and turning slowly, so drops catch the eye without looking like buffs.
        v.position.y = 0.12;
        v.rotation.y = t * 0.8 + e;
        v.scale.setScalar(1.4);
      }
    }

    drawHeld(alpha);
    // A gate sinks into the floor when the run opens its door, and rises again in the next arena.
    const sink = 1 - Math.exp(-dt * 3);
    gate.position.y += ((RunView.tunnelOpen ? -GATE_HEIGHT / 2 - 0.05 : GATE_HEIGHT / 2) - gate.position.y) * sink;
    finalGate.position.y += ((RunView.finalDoorOpen ? -GATE_HEIGHT / 2 - 0.05 : GATE_HEIGHT / 2) - finalGate.position.y) * sink;
    followCamera(alpha, dt);

    // Trauma squared, so small hits barely move the camera and a roar really does.
    const s = Shake.trauma * Shake.trauma;
    const roll = wobble(t * 17, 4) * 0.04 * s;
    shakeOffset.set(wobble(t * 23, 1) * 0.9 * s, wobble(t * 19, 2) * 0.5 * s, wobble(t * 29, 3) * 0.9 * s);
    camera.position.add(shakeOffset);
    camera.rotation.z += roll;
    renderer.render(scene, camera);
    // Undone straight away: mouse aim raycasts through this camera, and a shaken
    // camera would move the aim point, leaking the shake into the simulation.
    camera.position.sub(shakeOffset);
    camera.rotation.z -= roll;
  }

  // Held items are drawn in the player's hand: the simulation only keeps them at
  // the player's centre, and the hand, swing and thrust are presentation.
  function drawHeld(alpha: number): void {
    flame.visible = false;
    const h = focus();
    if (!isLive(h)) return;
    const p = indexOf(h);
    const item = handleAt(Wielder.held, p);
    if (!isLive(item)) return;
    const v = visuals[indexOf(item)];
    if (!v) return;

    const yaw = Math.atan2(-PlayerInput.aimX, -PlayerInput.aimZ);
    const progress = Wielder.swing[p] > 0 ? 1 - Wielder.swing[p] / SWING_TICKS : 0;
    const kind = visualKind[indexOf(item)];
    const thrust = kind === ShapeKind.Spear ? Math.sin(progress * Math.PI) * 0.9 : 0;
    // A sword sweeps right to left across the arc.
    const sweep = kind === ShapeKind.Sword && progress > 0 ? 1.1 - 2.2 * progress : 0;

    const px = Transform.px[p] + (Transform.x[p] - Transform.px[p]) * alpha;
    const pz = Transform.pz[p] + (Transform.z[p] - Transform.pz[p]) * alpha;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // Right hand: forward rotated a quarter turn clockwise.
    v.position.set(px - fz * 0.45 + fx * (0.15 + thrust), HAND_HEIGHT, pz + fx * 0.45 + fz * (0.15 + thrust));
    v.rotation.set(0, yaw + sweep, 0);
    v.scale.setScalar(1);
    // A spinning hammer circles you, head out, faster as its momentum builds.
    if (kind === ShapeKind.Warhammer && PlayerInput.throwHeld && Wielder.charge[p] > 0) {
      const momentum = Math.min(1, Wielder.charge[p] / CHARGE_MAX_TICKS);
      const turn = (performance.now() / 1000) * (9 + 15 * momentum);
      v.position.set(px, HAND_HEIGHT, pz);
      v.rotation.set(0, turn, 0);
    }
    // The flame shows while the simulation says it's spraying (it keeps swing up then).
    if (kind === ShapeKind.Flamethrower && Wielder.swing[p] > 0) {
      flame.visible = true;
      flame.position.set(v.position.x + fx * 0.6, HAND_HEIGHT, v.position.z + fz * 0.6);
      flame.rotation.set(0, yaw, 0);
      flame.scale.setScalar(0.92 + Math.sin(performance.now() / 30) * 0.08);
    }
  }

  // The boss's glowing core turns to track the player, so its attention is readable.
  function faceFocus(v: Visual): void {
    const h = focus();
    if (!isLive(h)) return;
    const p = indexOf(h);
    v.rotation.y = Math.atan2(Transform.x[p] - v.position.x, Transform.z[p] - v.position.z);
  }

  // Drawn at the slam's own centre, so a jump shows where it will land the moment it takes off.
  function drawTelegraph(e: number, progress: number): void {
    const active = has(e as EntityId, C.Slam);
    if (!active && !telegraphs[e]) return;
    const g = telegraphs[e] ?? (telegraphs[e] = buildTelegraph());
    if (!g.parent) scene.add(g);
    g.visible = active;
    if (!active) return;
    const r = Slam.radius[e];
    g.position.set(Slam.x[e], 0, Slam.z[e]);
    g.scale.set(r, 1, r);
    const fill = g.userData.fill as THREE.Mesh;
    fill.scale.setScalar(Math.max(0.001, progress));
  }

  // Pattern.gapAt is the same number the ring's bullets are fired from, so the
  // floor can't show a gap the bullets don't leave.
  function drawWedges(
    e: number, pool: (THREE.Group | null)[], shape: THREE.BufferGeometry, color: number, count: number, active: boolean,
  ): void {
    if (!active && !pool[e]) return;
    const g = pool[e] ?? (pool[e] = buildWedges(shape, color, MAX_WEDGES));
    if (!g.parent) scene.add(g);
    g.visible = active;
    if (!active) return;
    g.position.set(visuals[e]!.position.x, 0.03, visuals[e]!.position.z);
    for (let k = 0; k < g.children.length; k++) {
      const wedge = g.children[k] as THREE.Mesh;
      wedge.visible = k < count;
      wedge.geometry = shape;
      wedge.rotation.y = -(Pattern.gapAt[e] + (k * 2 * Math.PI) / count);
    }
  }

  // A ring's gap wedge, one geometry per width a ring can have.
  const gapShapes = new Map<number, THREE.BufferGeometry>();
  function gapShape(half: number): THREE.BufferGeometry {
    const key = Math.round(half * 1000);
    let shape = gapShapes.get(key);
    if (!shape) {
      shape = new THREE.CircleGeometry(16, 12, -half, half * 2).rotateX(-Math.PI / 2);
      gapShapes.set(key, shape);
    }
    return shape;
  }

  // A charge's lane, or a sweep's arc and then its beam, as the floor and the air show them.
  const lanes: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  const arcs: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  const beams: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  const arcBuiltFor = new Uint32Array(MAX_ENTITIES);
  function drawLine(e: number, kind: number, elapsed: number, windup: number): void {
    const state = Line.state[e];
    const bx = visuals[e]!.position.x;
    const bz = visuals[e]!.position.z;
    const charging = kind === Action.Charge && (state === LineState.Telegraph || state === LineState.Live);
    const sweeping = kind === Action.Sweep && state === LineState.Telegraph;
    const beaming = kind === Action.Sweep && state === LineState.Live;

    if (charging || lanes[e]) {
      const lane = lanes[e] ?? (lanes[e] = new THREE.Mesh(geo.lane, new THREE.MeshBasicMaterial({
        color: COLOR.telegraph, transparent: true, opacity: 0, depthWrite: false,
      })));
      if (!lane.parent) scene.add(lane);
      lane.visible = charging;
      if (charging) {
        // Drawn from where the charge started: Line.length runs from there.
        const a = Line.angle[e];
        const live = state === LineState.Live;
        const length = Line.length[e];
        const ox = live ? (lane.userData.x ?? bx) : bx;
        const oz = live ? (lane.userData.z ?? bz) : bz;
        if (!live) { lane.userData.x = bx; lane.userData.z = bz; }
        lane.position.set(ox + Math.cos(a) * length / 2, 0.025, oz + Math.sin(a) * length / 2);
        lane.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
        lane.scale.set(Line.width[e], 1, length);
        (lane.material as THREE.MeshBasicMaterial).opacity = live ? 0.35 : 0.08 + 0.3 * Math.min(1, elapsed / (windup || 1));
      }
    }

    if (sweeping || arcs[e]) {
      const arc = arcs[e] ?? (arcs[e] = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
        color: COLOR.beam, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      })));
      if (!arc.parent) scene.add(arc);
      arc.visible = sweeping;
      if (sweeping) {
        // Built once per sweep: its arc is fixed when the telegraph starts.
        if (arcBuiltFor[e] !== BossAction.startedAt[e]) {
          arc.geometry.dispose();
          const half = Math.abs(Line.arc[e]) / 2;
          arc.geometry = new THREE.CircleGeometry(Arena.half * 1.6, 48, -half, half * 2).rotateX(-Math.PI / 2);
          arc.userData.mid = Line.angle[e] + Line.arc[e] / 2;
          arcBuiltFor[e] = BossAction.startedAt[e];
        }
        arc.position.set(bx, 0.02, bz);
        arc.rotation.y = -arc.userData.mid;
        (arc.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.18 * Math.min(1, elapsed / (windup || 1));
      }
    }

    if (beaming || beams[e]) {
      const beam = beams[e] ?? (beams[e] = new THREE.Mesh(geo.beam, new THREE.MeshBasicMaterial({
        color: COLOR.beam, transparent: true, opacity: 0.85, depthWrite: false,
      })));
      if (!beam.parent) scene.add(beam);
      beam.visible = beaming;
      if (beaming) {
        const a = Line.angle[e];
        const reach = Line.reach[e] || Arena.half * 2;
        beam.position.set(bx + Math.cos(a) * reach / 2, AIM_HEIGHT, bz + Math.sin(a) * reach / 2);
        beam.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
        beam.scale.set(Line.width[e], 0.25, reach);
      }
    }
  }

  function buildWedges(shape: THREE.BufferGeometry, color: number, count: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
    for (let k = 0; k < count; k++) g.add(new THREE.Mesh(shape, mat));
    return g;
  }

  function drawCone(e: number, active: boolean, progress: number): void {
    if (!active && !cones[e]) return;
    const m = cones[e] ?? (cones[e] = buildConeTelegraph());
    if (!m.parent) scene.add(m);
    m.visible = active;
    const h = focus();
    if (!active || !isLive(h)) return;
    const p = indexOf(h);
    const bx = visuals[e]!.position.x;
    const bz = visuals[e]!.position.z;
    m.position.x = bx;
    m.position.z = bz;
    m.rotation.y = -Math.atan2(Transform.z[p] - bz, Transform.x[p] - bx);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.3 * Math.min(1, progress);
  }

  function followCamera(alpha: number, dt: number): void {
    const h = focus();
    if (isLive(h)) {
      const e = indexOf(h);
      const x = Transform.px[e] + (Transform.x[e] - Transform.px[e]) * alpha + PlayerInput.aimX * LOOK_AHEAD;
      const z = Transform.pz[e] + (Transform.z[e] - Transform.pz[e]) * alpha + PlayerInput.aimZ * LOOK_AHEAD;
      follow(cam, h, x, z, dt);
    }
    lookAt.set(cam.x, 0, cam.z);
    camera.position.set(lookAt.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, lookAt.z + CAMERA_OFFSET.z);
    camera.lookAt(lookAt);
  }

  function aimPoint(clientX: number, clientY: number, out: { x: number; z: number }): boolean {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(aimPlane, hit)) return false;
    out.x = hit.x;
    out.z = hit.z;
    reticle.position.set(hit.x, 0.03, hit.z);
    return true;
  }

  return { render, aimPoint };
}
