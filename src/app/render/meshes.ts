// What everything looks like: colours, shared geometry and materials, and the
import * as THREE from 'three';
// mesh for each shape. Built once and pooled by the scene; reads no components.
import { ShapeKind } from '../../ecs/components';
import { RING_GAP_HALF } from '../../ecs/systems/boss-scripts';
import { WEAPONS, WeaponKind } from '../../ecs/weapons/defs';

export const COLOR = {
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

// One colour per perk (see Perk), so a pickup says what it is from across the arena.
// A procedural boss's body, by Body: the Colossus stone-grey, the Lancer bronze, the Sentinel violet.
export const BODY_COLOR = [0x7c7a74, 0x9a7a4e, 0x6f6596];

export const PERK_COLOR = [0xffffff, 0xe8584a, 0x5fd39a, 0xffd65c, 0x9fb7ff, 0xd99cff];

// One per RewardKind: revive, armor, heal, Scattergun.
export const REWARD_COLOR = [0xffffff, 0xff7aa8, 0x9fb7ff, 0x5fd39a, 0xffb347];

// Ticks for spikes to grow out, so the roar's threat is visible before it bites.
export const SPIKE_GROW_TICKS = 40;

export const SPIKES_PER_RING = 8;

export const SWING_TICKS = 10;

export const HAND_HEIGHT = 0.9;

export const AIM_HEIGHT = 0.9; // bullets fly at this height, so aim on the same plane

export type Visual = THREE.Object3D & {
  userData: {
    mat?: THREE.MeshStandardMaterial; base?: number; spikes?: THREE.Group;
    gem?: THREE.Mesh; gemMat?: THREE.MeshStandardMaterial;
  };
};

export function shaded(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
}

export function cast<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { c.castShadow = true; c.receiveShadow = true; });
  return o;
}

// Shared geometry; per-entity materials only where a hit flash needs its own colour.
export const geo = {
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

export const railMat = new THREE.MeshStandardMaterial({ color: COLOR.rail, emissive: COLOR.rail, emissiveIntensity: 0.5, roughness: 0.3 });

export const flameMat = new THREE.MeshBasicMaterial({
  color: COLOR.flame, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
});

export const bulletMat = new THREE.MeshBasicMaterial({ color: COLOR.bullet });

export const enemyBulletMat = new THREE.MeshBasicMaterial({ color: COLOR.enemyBullet });

export const steelMat = new THREE.MeshStandardMaterial({ color: COLOR.steel, roughness: 0.35, metalness: 0.6 });

export const woodMat = shaded(COLOR.wood);

export const gunMat = shaded(COLOR.gun);

export function weapon(...parts: [THREE.BufferGeometry, THREE.Material][]): Visual {
  const g = new THREE.Group() as Visual;
  for (const [geometry, material] of parts) g.add(new THREE.Mesh(geometry, material));
  return cast(g);
}

export function buffVisual(color: number): Visual {
  const m = new THREE.Mesh(
    geo.buff,
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 }),
  ) as Visual;
  return cast(m);
}

export function build(kind: number): Visual {
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
