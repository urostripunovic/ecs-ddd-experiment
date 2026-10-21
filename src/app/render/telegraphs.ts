// Telegraphs: what the floor and the air show before and while a boss attacks.
import * as THREE from 'three';
import { Arena, BossAction, C, Line, LineState, Pattern, Slam, Transform } from '../../ecs/components';
import { MAX_ENTITIES, has, indexOf, isLive } from '../../ecs/core/world';
import type { EntityId, Handle } from '../../ecs/core/world';
import { Action, CONE_WINDUP, SPIRAL_WINDUP } from '../../ecs/systems/boss-actions';
import { RING_GAPS, RING_GAP_HALF, SPIRAL_ARMS } from '../../ecs/systems/boss-scripts';
import { AIM_HEIGHT, COLOR, geo } from './meshes';
import type { Visual } from './meshes';

// Rings have at most four gaps, spirals at most four arms.
export const MAX_WEDGES = 4;

// A flat wedge pointing down +x, turned toward the player while a cone winds up.
export const CONE_HALF_ANGLE = 0.4;

export const CONE_LENGTH = 11;

export function buildConeTelegraph(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(CONE_LENGTH, 24, -CONE_HALF_ANGLE, CONE_HALF_ANGLE * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: COLOR.telegraph, transparent: true, opacity: 0, depthWrite: false }),
  );
  m.position.y = 0.025;
  return m;
}

export function buildTelegraph(): THREE.Group {
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

// One per scene: every boss's telegraphs, pooled per boss row and hidden when
// the row's visual goes. A class because it owns meshes and their pools, not
// state the simulation cares about.
export class Telegraphs {
  private readonly slams: (THREE.Group | null)[] = new Array(MAX_ENTITIES).fill(null);
  private readonly cones: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  // Floor wedges: where a ring leaves its gaps, and where a spiral's arms start.
  private readonly gapWedges: (THREE.Group | null)[] = new Array(MAX_ENTITIES).fill(null);
  private readonly armWedges: (THREE.Group | null)[] = new Array(MAX_ENTITIES).fill(null);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly visuals: readonly (Visual | null)[],
    private readonly focus: () => Handle,
  ) {}

  // Everything a boss's current action shows, at where its visual stands this frame.
  draw(e: number, dead: boolean, elapsed: number, winding: number): void {
    this.drawTelegraph(e, winding);
    const windup = BossAction.windup[e];
    const kind = dead ? Action.Idle : BossAction.kind[e];
    this.drawCone(e, kind === Action.Cone && elapsed < (windup || CONE_WINDUP), elapsed / (windup || CONE_WINDUP));
    const ringing = kind === Action.Ring || kind === Action.Storm || kind === Action.Combo;
    this.drawWedges(e, this.gapWedges, this.gapShape(Pattern.gapHalf[e] || RING_GAP_HALF), COLOR.safe, Pattern.gaps[e] || RING_GAPS, ringing);
    this.drawWedges(
      e, this.armWedges, geo.arm, COLOR.telegraph, Pattern.arms[e] || SPIRAL_ARMS,
      kind === Action.Spiral && elapsed < (windup || SPIRAL_WINDUP),
    );
    this.drawLine(e, kind, elapsed, windup);
  }

  hide(e: number): void {
    for (const pool of [this.slams, this.cones, this.gapWedges, this.armWedges, this.lanes, this.arcs, this.beams]) {
      if (pool[e]) pool[e]!.visible = false;
    }
  }

  private drawTelegraph(e: number, progress: number): void {
    const active = has(e as EntityId, C.Slam);
    if (!active && !this.slams[e]) return;
    const g = this.slams[e] ?? (this.slams[e] = buildTelegraph());
    if (!g.parent) this.scene.add(g);
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
  private drawWedges(
    e: number, pool: (THREE.Group | null)[], shape: THREE.BufferGeometry, color: number, count: number, active: boolean,
  ): void {
    if (!active && !pool[e]) return;
    const g = pool[e] ?? (pool[e] = this.buildWedges(shape, color, MAX_WEDGES));
    if (!g.parent) this.scene.add(g);
    g.visible = active;
    if (!active) return;
    g.position.set(this.visuals[e]!.position.x, 0.03, this.visuals[e]!.position.z);
    for (let k = 0; k < g.children.length; k++) {
      const wedge = g.children[k] as THREE.Mesh;
      wedge.visible = k < count;
      wedge.geometry = shape;
      wedge.rotation.y = -(Pattern.gapAt[e] + (k * 2 * Math.PI) / count);
    }
  }

  // A ring's gap wedge, one geometry per width a ring can have.
  private readonly gapShapes = new Map<number, THREE.BufferGeometry>();
  private gapShape(half: number): THREE.BufferGeometry {
    const key = Math.round(half * 1000);
    let shape = this.gapShapes.get(key);
    if (!shape) {
      shape = new THREE.CircleGeometry(16, 12, -half, half * 2).rotateX(-Math.PI / 2);
      this.gapShapes.set(key, shape);
    }
    return shape;
  }

  // A charge's lane, or a sweep's arc and then its beam, as the floor and the air show them.
  private readonly lanes: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  private readonly arcs: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  private readonly beams: (THREE.Mesh | null)[] = new Array(MAX_ENTITIES).fill(null);
  private readonly arcBuiltFor = new Uint32Array(MAX_ENTITIES);
  private drawLine(e: number, kind: number, elapsed: number, windup: number): void {
    const state = Line.state[e];
    const bx = this.visuals[e]!.position.x;
    const bz = this.visuals[e]!.position.z;
    const charging = kind === Action.Charge && (state === LineState.Telegraph || state === LineState.Live);
    const sweeping = kind === Action.Sweep && state === LineState.Telegraph;
    const beaming = kind === Action.Sweep && state === LineState.Live;

    if (charging || this.lanes[e]) {
      const lane = this.lanes[e] ?? (this.lanes[e] = new THREE.Mesh(geo.lane, new THREE.MeshBasicMaterial({
        color: COLOR.telegraph, transparent: true, opacity: 0, depthWrite: false,
      })));
      if (!lane.parent) this.scene.add(lane);
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

    if (sweeping || this.arcs[e]) {
      const arc = this.arcs[e] ?? (this.arcs[e] = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
        color: COLOR.beam, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      })));
      if (!arc.parent) this.scene.add(arc);
      arc.visible = sweeping;
      if (sweeping) {
        // Built once per sweep: its arc is fixed when the telegraph starts.
        if (this.arcBuiltFor[e] !== BossAction.startedAt[e]) {
          arc.geometry.dispose();
          const half = Math.abs(Line.arc[e]) / 2;
          arc.geometry = new THREE.CircleGeometry(Arena.half * 1.6, 48, -half, half * 2).rotateX(-Math.PI / 2);
          arc.userData.mid = Line.angle[e] + Line.arc[e] / 2;
          this.arcBuiltFor[e] = BossAction.startedAt[e];
        }
        arc.position.set(bx, 0.02, bz);
        arc.rotation.y = -arc.userData.mid;
        (arc.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.18 * Math.min(1, elapsed / (windup || 1));
      }
    }

    if (beaming || this.beams[e]) {
      const beam = this.beams[e] ?? (this.beams[e] = new THREE.Mesh(geo.beam, new THREE.MeshBasicMaterial({
        color: COLOR.beam, transparent: true, opacity: 0.85, depthWrite: false,
      })));
      if (!beam.parent) this.scene.add(beam);
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

  private buildWedges(shape: THREE.BufferGeometry, color: number, count: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
    for (let k = 0; k < count; k++) g.add(new THREE.Mesh(shape, mat));
    return g;
  }

  private drawCone(e: number, active: boolean, progress: number): void {
    if (!active && !this.cones[e]) return;
    const m = this.cones[e] ?? (this.cones[e] = buildConeTelegraph());
    if (!m.parent) this.scene.add(m);
    m.visible = active;
    const h = this.focus();
    if (!active || !isLive(h)) return;
    const p = indexOf(h);
    const bx = this.visuals[e]!.position.x;
    const bz = this.visuals[e]!.position.z;
    m.position.x = bx;
    m.position.z = bz;
    m.rotation.y = -Math.atan2(Transform.z[p] - bz, Transform.x[p] - bx);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.3 * Math.min(1, progress);
  }

}
