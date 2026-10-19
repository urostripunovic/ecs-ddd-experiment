// Reads components only. Nothing here can change the simulation.
import * as THREE from 'three';
import {
  Arena, BossAction, BossPhase, C, Collider, Hurt, PlayerInput, Shape, ShapeKind, Slam, StuckIn, Transform, Velocity,
  Wielder,
} from '../../ecs/components';
import { Action, CONE_WINDUP } from '../../ecs/systems/boss-actions';
import { bossPose } from './boss-pose';
import { handleAt, has, indexOf, isLive, MAX, world, type EntityId, type Handle } from '../../ecs/core/world';

const COLOR = {
  bg: 0x1b1c1e,
  floor: 0x45484d,
  wall: 0x5b5f66,
  pillar: 0x6d7178,
  player: 0x7fb2d9,
  boss: 0x8f8c87,
  bossEnraged: 0xa45a43,
  bullet: 0xffd65c,
  enemyBullet: 0xff6b3d,
  telegraph: 0xd9573b,
  dead: 0x2f3134,
  steel: 0xc9ced6,
  wood: 0x9c7a52,
  gun: 0x3b4048,
  haste: 0x5fd39a,
  fury: 0xe8584a,
};

const SWING_TICKS = 10; // matches the attack system; only used to time the animation
const HAND_HEIGHT = 0.9;

const CAMERA_OFFSET = new THREE.Vector3(0, 26, 16);
// Leading the aim a little shows more of where you are shooting than where you have been.
const LOOK_AHEAD = 3;
const AIM_HEIGHT = 0.9; // bullets fly at this height, so aim on the same plane

type Visual = THREE.Object3D & { userData: { mat?: THREE.MeshStandardMaterial; base?: number } };

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
};
const bulletMat = new THREE.MeshBasicMaterial({ color: COLOR.bullet });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: COLOR.enemyBullet });
const pillarMat = shaded(COLOR.pillar);
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
      const m = new THREE.Mesh(geo.pillar, pillarMat) as Visual;
      return cast(m);
    }
    case ShapeKind.Sword: return weapon([geo.blade, steelMat], [geo.guard, gunMat]);
    case ShapeKind.Spear: return weapon([geo.shaft, woodMat], [geo.tip, steelMat]);
    case ShapeKind.Gun: return weapon([geo.gunBody, gunMat], [geo.gunGrip, gunMat]);
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
  for (const [x, z, w, d] of [
    [0, -Arena.half - t / 2, size + t * 2, t],
    [0, Arena.half + t / 2, size + t * 2, t],
    [-Arena.half - t / 2, 0, t, size],
    [Arena.half + t / 2, 0, t, size],
  ]) {
    const wall = cast(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat));
    wall.position.set(x, h / 2, z);
    scene.add(wall);
  }
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

  scene.add(new THREE.HemisphereLight(0xe4e8ee, 0x2a2b2e, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(14, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 70 });
  scene.add(sun);

  buildArena(scene);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.3, 32),
    new THREE.MeshBasicMaterial({ color: COLOR.player, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  reticle.rotation.x = -Math.PI / 2;
  scene.add(reticle);

  // Visuals are pooled per shape and keyed by slot + generation, so a recycled
  // slot never inherits the previous occupant's mesh.
  const visuals: (Visual | null)[] = new Array(MAX).fill(null);
  const visualGen = new Uint16Array(MAX);
  const visualKind = new Uint8Array(MAX);
  const pools: Visual[][] = Object.values(ShapeKind).map(() => []);
  const telegraphs: (THREE.Group | null)[] = new Array(MAX).fill(null);
  const cones: (THREE.Mesh | null)[] = new Array(MAX).fill(null);
  let highWater = 0;

  const release = (e: number) => {
    const v = visuals[e]!;
    scene.remove(v);
    pools[visualKind[e]].push(v);
    visuals[e] = null;
    if (telegraphs[e]) telegraphs[e]!.visible = false;
    if (cones[e]) cones[e]!.visible = false;
  };

  const acquire = (e: number, kind: number): Visual => {
    const v = pools[kind].pop() ?? build(kind);
    v.rotation.set(0, 0, 0);
    v.scale.setScalar(1);
    v.position.y = kind === ShapeKind.Bullet || kind === ShapeKind.EnemyBullet ? AIM_HEIGHT : 0;
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
      const kind = world.alive[e] && has(e as EntityId, C.Shape) ? Shape.kind[e] : 0;
      if (visuals[e] && (kind === 0 || visualGen[e] !== world.generation[e] || visualKind[e] !== kind)) release(e);
      if (kind === 0) continue;

      const v = visuals[e] ?? acquire(e, kind);
      v.position.x = Transform.px[e] + (Transform.x[e] - Transform.px[e]) * alpha;
      v.position.z = Transform.pz[e] + (Transform.z[e] - Transform.pz[e]) * alpha;

      const dead = has(e as EntityId, C.Dead);
      const mat = v.userData.mat;
      if (mat) {
        let color = v.userData.base!;
        if (kind === ShapeKind.Boss && BossPhase.phase[e] === 2) color = COLOR.bossEnraged;
        if (dead) color = COLOR.dead;
        mat.color.setHex(color);
        mat.emissive.setHex(Hurt.flash[e] > 0 && !dead ? 0x777777 : 0x000000);
      }

      if (kind === ShapeKind.Player) {
        v.rotation.y = Math.atan2(-PlayerInput.aimX, -PlayerInput.aimZ);
        v.rotation.z = dead ? Math.PI / 2 : 0;
        v.position.y = dead ? 0.42 : 0;
      } else if (kind === ShapeKind.Boss) {
        const slamming = has(e as EntityId, C.Slam);
        const winding = slamming ? 1 - Slam.timer[e] / Slam.windup[e] : 0;
        const elapsed = world.tick - BossAction.startedAt[e] + alpha;
        const pose = bossPose(dead ? Action.Idle : BossAction.kind[e], elapsed, winding);
        v.position.y = dead ? -0.9 : pose.height;
        v.rotation.z = dead ? 0.25 : 0;
        v.rotation.x = pose.lean;
        if (!dead) faceFocus(v);
        v.scale.set(pose.sx, pose.sy, pose.sx);
        drawTelegraph(e, winding);
        drawCone(e, !dead && BossAction.kind[e] === Action.Cone && elapsed < CONE_WINDUP, elapsed / CONE_WINDUP);
      } else if (kind === ShapeKind.Bullet) {
        // A tracer reads far better than a dot at this camera distance.
        v.rotation.y = Math.atan2(Velocity.x[e], Velocity.z[e]);
      } else if (kind === ShapeKind.Pillar) {
        const r = Collider.radius[e];
        v.scale.set(r, 1, r);
        v.position.y = 1.6;
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
        // A spear flies point first; anything else tumbles.
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
    followCamera(alpha, dt);
    renderer.render(scene, camera);
  }

  // Held items are drawn in the player's hand: the simulation only keeps them at
  // the player's centre, and the hand, swing and thrust are presentation.
  function drawHeld(alpha: number): void {
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
      // Frame-rate independent smoothing: the same feel at 30 Hz and 144 Hz.
      const k = 1 - Math.exp(-dt * 8);
      lookAt.x += (x - lookAt.x) * k;
      lookAt.z += (z - lookAt.z) * k;
    }
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
