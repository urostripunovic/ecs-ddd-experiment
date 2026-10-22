// Reads components only. Nothing here can change the simulation.
import * as THREE from 'three';
import type { Visual } from './meshes';
import { DOORS } from '../../ecs/arenas';
import { BossStyleKind } from '../../ecs/bosses/defs';
import { BossAction, BossGen, BossPhase, BossStyle, Burn, C, Collider, Hurt, Jump, Line, LineState, Orbit, PerkPickup, PlayerInput, Revive, RewardPickup, RunView, Shake, Shape, ShapeKind, Slam, Spikes, StuckIn, Tracer, Transform, Velocity } from '../../ecs/components';
import { MAX_ENTITIES, NOBODY, has, indexOf, isLive, world } from '../../ecs/core/world';
import type { EntityId, Handle } from '../../ecs/core/world';
import { Action } from '../../ecs/systems/boss-actions';
import { dizzy, dodging } from '../../ecs/systems/status';
import { bossPose } from './boss-pose';
import { follow } from './camera';
import type { Follow } from './camera';
import { AIM_HEIGHT, BODY_COLOR, COLOR, HAND_HEIGHT, PERK_COLOR, REWARD_COLOR, SPIKE_GROW_TICKS, build } from './meshes';
import { Telegraphs } from './telegraphs';
import { HeldWeapon } from './held';
import { buildArena, buildGate, GATE_HEIGHT } from './hall';

// Two sines at unrelated rates: smooth, so the shake rolls instead of jittering.
// Render-only, so it may be anything; it never reaches the simulation.
export const wobble = (x: number, seed: number) => (Math.sin(x + seed * 12.9) + Math.sin(x * 1.7 + seed * 4.1)) * 0.5;

export const shakeOffset = new THREE.Vector3(); // matches the attack system; only used to time the animation

export const CAMERA_OFFSET = new THREE.Vector3(0, 26, 16);

// Leading the aim a little shows more of where you are shooting than where you have been.
export const LOOK_AHEAD = 3;

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

  const held = new HeldWeapon(scene);

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
  const telegraphs = new Telegraphs(scene, visuals, focus);
  let highWater = 0;

  const release = (e: number) => {
    const v = visuals[e]!;
    scene.remove(v);
    pools[visualKind[e]].push(v);
    visuals[e] = null;
    telegraphs.hide(e);
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
        telegraphs.draw(e, dead, elapsed, winding);
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

    held.draw(focus(), visuals, visualKind, alpha);
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

  // The boss's glowing core turns to track the player, so its attention is readable.
  function faceFocus(v: Visual): void {
    const h = focus();
    if (!isLive(h)) return;
    const p = indexOf(h);
    v.rotation.y = Math.atan2(Transform.x[p] - v.position.x, Transform.z[p] - v.position.z);
  }

  // Drawn at the slam's own centre, so a jump shows where it will land the moment it takes off.
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
