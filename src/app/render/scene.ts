// Reads components only. Nothing here can change the simulation.
import * as THREE from 'three';
import {
  Arena, BossPhase, C, Collider, Hurt, PlayerInput, Shape, ShapeKind, Slam, Transform, Velocity,
} from '../../ecs/components';
import { has, indexOf, isLive, MAX, world, type EntityId, type Handle } from '../../ecs/core/world';

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
};

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
};
const bulletMat = new THREE.MeshBasicMaterial({ color: COLOR.bullet });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: COLOR.enemyBullet });
const pillarMat = shaded(COLOR.pillar);

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
  const pools: Visual[][] = [[], [], [], [], [], []];
  const telegraphs: (THREE.Group | null)[] = new Array(MAX).fill(null);
  let highWater = 0;

  const release = (e: number) => {
    const v = visuals[e]!;
    scene.remove(v);
    pools[visualKind[e]].push(v);
    visuals[e] = null;
    if (telegraphs[e]) telegraphs[e]!.visible = false;
  };

  const acquire = (e: number, kind: number): Visual => {
    const v = pools[kind].pop() ?? build(kind);
    v.rotation.set(0, 0, 0);
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
        v.position.y = dead ? -0.9 : 0;
        v.rotation.z = dead ? 0.25 : 0;
        if (!dead) faceFocus(v);
        // Windup squash sells the slam before it lands.
        const winding = has(e as EntityId, C.Slam) ? 1 - Slam.timer[e] / Slam.windup[e] : 0;
        v.scale.set(1 + winding * 0.12, 1 - winding * 0.18, 1 + winding * 0.12);
        drawTelegraph(e, v.position.x, v.position.z, winding);
      } else if (kind === ShapeKind.Bullet) {
        // A tracer reads far better than a dot at this camera distance.
        v.rotation.y = Math.atan2(Velocity.x[e], Velocity.z[e]);
      } else if (kind === ShapeKind.Pillar) {
        const r = Collider.radius[e];
        v.scale.set(r, 1, r);
        v.position.y = 1.6;
      }
    }

    followCamera(alpha, dt);
    renderer.render(scene, camera);
  }

  // The boss's glowing core turns to track the player, so its attention is readable.
  function faceFocus(v: Visual): void {
    const h = focus();
    if (!isLive(h)) return;
    const p = indexOf(h);
    v.rotation.y = Math.atan2(Transform.x[p] - v.position.x, Transform.z[p] - v.position.z);
  }

  function drawTelegraph(e: number, x: number, z: number, progress: number): void {
    const active = has(e as EntityId, C.Slam);
    if (!active && !telegraphs[e]) return;
    const g = telegraphs[e] ?? (telegraphs[e] = buildTelegraph());
    if (!g.parent) scene.add(g);
    g.visible = active;
    if (!active) return;
    const r = Slam.radius[e];
    g.position.set(x, 0, z);
    g.scale.set(r, 1, r);
    const fill = g.userData.fill as THREE.Mesh;
    fill.scale.setScalar(Math.max(0.001, progress));
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
