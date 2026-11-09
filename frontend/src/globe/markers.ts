/**
 * The severity lights. News is a pillar of light rising from its location, with a bright
 * core, a soft outer glow and a glowing spot on the ground. A natural disaster is a symbol
 * instead (./hazard-icons.ts): a glass disc with a severity-coloured rim and halo, floating on
 * a thin stem of light above the same glowing spot, so the two read differently at a glance.
 * Both grow and pulse faster with severity (see ../severity.ts); globe.gl's ring layer adds
 * outward rings for high and critical events (see globe.ts).
 *
 * Drawn with instancing: all pillars (or symbols) of one severity share one mesh per part, so a
 * thousand events cost a couple of dozen draw calls. Clicking and hovering use a separate invisible column per
 * event, handed to globe.gl's custom layer (hidden objects are still hit-tested, and the
 * globe itself blocks events on its far side).
 */

import {
  AddEquation,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  NormalBlending,
  OneFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
} from 'three';
import { SEVERITY_STYLES } from '../severity';
import type { Cluster } from '../clusters';
import { SEVERITIES, type Severity } from '../types';
import { ATLAS_COLUMNS, ATLAS_ROWS, ICON_FILL, drawAtlas, iconIndex } from './hazard-icons';

/** World units; the globe's radius is 100. */
const BASE_HEIGHT = 8;
const CORE_RADIUS = 0.36;
const GLOW_RADIUS = 1.7;
const SPOT_SIZE = 5.2;
const HIT_RADIUS = 2.6;
/** Camera distance at which pillars have their base width. */
const REFERENCE_DISTANCE = 350;
const SELECTED_SCALE = 1.35;
/** A disaster symbol's quad side for a low-severity event (the disc fills DISC_RADIUS of it). */
const SYMBOL_SIZE = 7;
/** The disc's radius as a fraction of the quad's half side. */
const DISC_RADIUS = 0.62;
/** How high a symbol's centre floats, in disc radii: just enough to clear the ground, so the
 * disc covers its own foot (a higher float shows the foot as a second dot beside it when the
 * globe is seen at an angle). */
const SYMBOL_LIFT = 1.2;
/** The symbol's stem is this much of a pillar's width, its ground spot this much of a pillar's
 * spot (small and soft, so it doesn't read as a second marker beside the disc). */
const STEM_WIDTH = 0.42;
const SYMBOL_SPOT = 0.5;

/** Pillar height in world units for a severity: grows faster than the size. */
export function pillarHeight(severity: Severity): number {
  return BASE_HEIGHT * SEVERITY_STYLES[severity].size ** 1.6;
}

// Additive light on a transparent canvas: colour and alpha both add up.
const lightBlending = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneFactor,
  transparent: true,
  depthWrite: false,
} as const;

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;

  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 mv = modelViewMatrix * local;
    vec3 viewNormal = normalize(normalMatrix * n);
    // 1 where the surface faces the camera (the beam's middle), 0 at its edges.
    vFacing = abs(dot(viewNormal, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float time;
  uniform float period;

  varying vec2 vUv;
  varying float vFacing;

  void main() {
    // Brightest at the ground, fading upwards; soft edges.
    float fade = pow(1.0 - vUv.y, 1.4);
    float body = pow(vFacing, 1.4);
    float pulse = period > 0.0 ? 0.8 + 0.2 * sin(6.2831853 * time / period) : 1.0;
    // Bands of light flowing upwards on pulsing pillars (none with reduced motion).
    float flow = period > 0.0 ? 0.78 + 0.22 * sin(vUv.y * 26.0 - time * 5.0 / period) : 1.0;
    vec3 light = color * strength * fade * body * pulse * flow;
    // A white-hot base where the pillar meets the ground.
    light += vec3(1.0) * pow(1.0 - vUv.y, 10.0) * body * strength * 0.35;
    gl_FragColor = vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0));
  }
`;

const spotVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 local = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const spotFragment = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  uniform float period;

  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float swell = period > 0.0 ? 0.5 + 0.5 * sin(6.2831853 * time / period) : 0.0;
    float spot = pow(max(1.0 - d, 0.0), 2.4);
    float halo = pow(max(1.0 - d, 0.0), 1.2) * (0.25 + 0.2 * swell);
    vec3 light = color * (spot * 1.3 + halo) + vec3(1.0) * pow(max(1.0 - d * 3.0, 0.0), 2.0) * 0.8;
    gl_FragColor = vec4(light, clamp(max(light.r, max(light.g, light.b)), 0.0, 1.0));
  }
`;

const discVertex = /* glsl */ `
  attribute float aIcon;
  uniform vec2 cells;
  varying vec2 vP;
  varying vec2 vCell;

  void main() {
    // A quad that always faces the camera, centred on the top of its stem.
    vP = position.xy * 2.0;
    vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 1.0, 0.0, 1.0);
    float side = length(instanceMatrix[0].xyz);
    centre.xy += position.xy * side;
    gl_Position = projectionMatrix * centre;
    vCell = vec2(mod(aIcon, cells.x), floor(aIcon / cells.x));
  }
`;

const discFragment = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  uniform float period;
  uniform sampler2D atlas;
  uniform vec2 cells;
  uniform float discRadius;
  uniform float iconFill;

  varying vec2 vP;
  varying vec2 vCell;

  void main() {
    float d = length(vP);
    float aa = fwidth(d) * 1.2;
    float R = discRadius;
    float swell = period > 0.0 ? 0.5 + 0.5 * sin(6.2831853 * time / period) : 0.0;

    // Dark glass, a little lighter towards the top.
    float disc = 1.0 - smoothstep(R - aa, R + aa, d);
    vec3 glass = mix(vec3(0.010, 0.014, 0.020), vec3(0.045, 0.055, 0.075), clamp(0.5 + vP.y, 0.0, 1.0));
    glass += color * 0.10 * (1.0 - d / R);

    // The symbol: the 24-unit grid spans 2 * 0.70 * R of the quad.
    vec2 iconUv = vP / (2.0 * 0.70 * R) + 0.5;
    vec2 local = (iconUv - 0.5) * iconFill + 0.5;
    vec2 atlasUv = vec2((vCell.x + local.x) / cells.x, 1.0 - (vCell.y + 1.0 - local.y) / cells.y);
    vec2 inside = step(vec2(0.0), iconUv) * step(iconUv, vec2(1.0));
    vec2 mask = texture2D(atlas, atlasUv).rg * inside.x * inside.y;
    vec3 mainColor = mix(vec3(1.0), color, 0.12);
    vec3 accent = mix(color, vec3(1.0), 0.18);
    vec3 c = mix(glass, accent, mask.g);
    c = mix(c, mainColor, mask.r);

    // A crisp rim in the severity colour, then a soft halo outside it that swells with the pulse.
    float rim = 1.0 - smoothstep(0.035, 0.035 + aa, abs(d - R));
    c = mix(c, mix(color, vec3(1.0), 0.15), rim);
    float halo = (1.0 - disc) * pow(clamp((1.0 - d) / (1.0 - R), 0.0, 1.0), 1.8) * (0.30 + 0.35 * swell);

    vec3 outColor = mix(color, c, max(disc, rim));
    float alpha = max(max(disc * 0.95, rim), halo);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(outColor, alpha);
    #include <colorspace_fragment>
  }
`;

let atlasTexture: CanvasTexture | null = null;

/** The symbols' texture atlas, drawn once on first use. */
function symbolAtlas(): CanvasTexture {
  if (atlasTexture) return atlasTexture;
  const canvas = document.createElement('canvas');
  drawAtlas(canvas);
  atlasTexture = new CanvasTexture(canvas);
  atlasTexture.colorSpace = NoColorSpace;
  atlasTexture.minFilter = LinearMipmapLinearFilter;
  atlasTexture.generateMipmaps = true;
  return atlasTexture;
}

function uniformsFor(severity: Severity, strength: number) {
  return {
    color: { value: new Color(SEVERITY_STYLES[severity].color) },
    strength: { value: strength },
    time: { value: 0 },
    period: { value: SEVERITY_STYLES[severity].pulseSeconds ?? 0 },
  };
}

// Shared geometries, built standing on the ground (y = 0) and 1 unit tall, so scaling y
// sets the height.
const coreGeometry = new CylinderGeometry(CORE_RADIUS, CORE_RADIUS * 0.6, 1, 10, 1, true).translate(
  0,
  0.5,
  0,
);
const glowGeometry = new CylinderGeometry(
  GLOW_RADIUS * 0.55,
  GLOW_RADIUS,
  1,
  20,
  1,
  true,
).translate(0, 0.5, 0);
const spotGeometry = new PlaneGeometry(SPOT_SIZE, SPOT_SIZE)
  .rotateX(-Math.PI / 2)
  .translate(0, 0.05, 0);
const hitGeometry = new CylinderGeometry(HIT_RADIUS, HIT_RADIUS, 1, 8).translate(0, 0.5, 0);
const discGeometry = new PlaneGeometry(1, 1);
const hitMaterial = new MeshBasicMaterial();

interface Anchor {
  cluster: Cluster;
  position: Vector3;
  turn: Quaternion;
  /** Groups of several events are a little wider (at most +60%). */
  widen: number;
  /** The disaster symbol's atlas index (./hazard-icons.ts), or null for a pillar. */
  icon: number | null;
}

type PartKind = 'beam' | 'spot' | 'stem' | 'disc';

/** How much wider a group's pillar is than a single event's. */
export function groupWidening(count: number): number {
  return count > 1 ? 1 + Math.min(0.6, Math.log10(count) * 0.45) : 1;
}

interface Level {
  severity: Severity;
  /** Pillars of light (news) or disaster symbols. */
  symbols: boolean;
  anchors: Anchor[];
  parts: { mesh: InstancedMesh; kind: PartKind }[];
  materials: ShaderMaterial[];
}

const UP = new Vector3(0, 1, 0);
const matrix = new Matrix4();
const scale = new Vector3();

/** Every pillar and disaster symbol on the globe, drawn in a handful of instanced meshes. */
export class PillarField {
  readonly group = new Group();
  private readonly levels: Level[] = [];
  private readonly hits = new Map<string, Mesh>();
  private lastZoom = -1;
  private lastSelected: string | null = null;

  /** One pillar or symbol per group (see ../clusters.ts); `coords` turns latitude and
   * longitude into a point on the globe's surface. */
  constructor(
    clusters: Cluster[],
    coords: (lat: number, lng: number) => { x: number; y: number; z: number },
  ) {
    this.group.name = 'pillars';
    for (const severity of SEVERITIES) {
      const all: Anchor[] = clusters
        .filter((c) => c.severity === severity)
        .map((cluster) => {
          const p = coords(cluster.lat, cluster.lng);
          const position = new Vector3(p.x, p.y, p.z);
          return {
            cluster,
            position,
            turn: new Quaternion().setFromUnitVectors(UP, position.clone().normalize()),
            widen: groupWidening(cluster.events.length),
            icon: iconIndex(cluster.lead),
          };
        });
      const pillars = all.filter((a) => a.icon === null);
      const symbols = all.filter((a) => a.icon !== null);
      if (pillars.length) this.levels.push(this.pillarLevel(severity, pillars));
      if (symbols.length) this.levels.push(this.symbolLevel(severity, symbols));
    }
  }

  private mesh(
    geometry: BufferGeometry,
    material: ShaderMaterial,
    count: number,
    order: number,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.group.add(mesh);
    return mesh;
  }

  private pillarLevel(severity: Severity, anchors: Anchor[]): Level {
    const core = new ShaderMaterial({
      uniforms: uniformsFor(severity, 2.0),
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      ...lightBlending,
    });
    const glow = new ShaderMaterial({
      uniforms: uniformsFor(severity, 0.7),
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      ...lightBlending,
    });
    const spot = new ShaderMaterial({
      uniforms: uniformsFor(severity, 1),
      vertexShader: spotVertex,
      fragmentShader: spotFragment,
      side: DoubleSide,
      ...lightBlending,
    });
    return {
      severity,
      symbols: false,
      anchors,
      parts: [
        { mesh: this.mesh(spotGeometry, spot, anchors.length, 2), kind: 'spot' },
        { mesh: this.mesh(glowGeometry, glow, anchors.length, 2), kind: 'beam' },
        { mesh: this.mesh(coreGeometry, core, anchors.length, 2), kind: 'beam' },
      ],
      materials: [core, glow, spot],
    };
  }

  private symbolLevel(severity: Severity, anchors: Anchor[]): Level {
    const stem = new ShaderMaterial({
      uniforms: uniformsFor(severity, 0.8),
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      ...lightBlending,
    });
    const spot = new ShaderMaterial({
      uniforms: uniformsFor(severity, 1),
      vertexShader: spotVertex,
      fragmentShader: spotFragment,
      side: DoubleSide,
      ...lightBlending,
    });
    const disc = new ShaderMaterial({
      uniforms: {
        ...uniformsFor(severity, 1),
        atlas: { value: symbolAtlas() },
        cells: { value: [ATLAS_COLUMNS, ATLAS_ROWS] },
        discRadius: { value: DISC_RADIUS },
        iconFill: { value: ICON_FILL },
      },
      vertexShader: discVertex,
      fragmentShader: discFragment,
      blending: NormalBlending,
      transparent: true,
      depthWrite: false,
    });
    // Each symbol mesh has its own copy of the quad, carrying which symbol each instance shows.
    const quad = discGeometry.clone();
    quad.setAttribute(
      'aIcon',
      new InstancedBufferAttribute(new Float32Array(anchors.map((a) => a.icon ?? 0)), 1),
    );
    return {
      severity,
      symbols: true,
      anchors,
      parts: [
        { mesh: this.mesh(spotGeometry, spot, anchors.length, 2), kind: 'spot' },
        { mesh: this.mesh(coreGeometry, stem, anchors.length, 2), kind: 'stem' },
        { mesh: this.mesh(quad, disc, anchors.length, 3), kind: 'disc' },
      ],
      materials: [stem, spot, disc],
    };
  }

  /** The invisible, easy-to-hit column for one group (for globe.gl's custom layer). */
  hitTarget(cluster: Cluster): Mesh {
    const hit = new Mesh(hitGeometry, hitMaterial);
    hit.visible = false;
    hit.name = `pillar:${cluster.id}`;
    this.hits.set(cluster.id, hit);
    this.lastZoom = -1; // size the new column on the next frame
    return hit;
  }

  /** Frees this field's GPU resources (the geometries are shared and kept). */
  dispose(): void {
    for (const level of this.levels) {
      for (const part of level.parts) {
        part.mesh.dispose();
        if (part.kind === 'disc') part.mesh.geometry.dispose();
      }
      for (const material of level.materials) material.dispose();
    }
    this.group.removeFromParent();
  }

  /** Places an event's hit column on the surface, standing straight outwards. */
  placeHitTarget(hit: Mesh, position: { x: number; y: number; z: number }): void {
    hit.position.set(position.x, position.y, position.z);
    hit.quaternion.setFromUnitVectors(UP, hit.position.clone().normalize());
  }

  /** Advances the shared pulse; with reduced motion the pillars stay still. */
  pulse(seconds: number, reducedMotion: boolean): void {
    for (const level of this.levels) {
      const period = reducedMotion ? 0 : (SEVERITY_STYLES[level.severity].pulseSeconds ?? 0);
      for (const material of level.materials) {
        material.uniforms.time.value = seconds;
        material.uniforms.period.value = period;
      }
    }
  }

  /**
   * Sizes every pillar for the camera's distance (slim when zoomed in, visible when zoomed
   * out) and the selection. Only recomputed when either changes noticeably.
   */
  update(cameraDistance: number, selectedId: string | null): void {
    const zoom = Math.min(1.3, Math.max(0.3, cameraDistance / REFERENCE_DISTANCE));
    if (Math.abs(zoom - this.lastZoom) < 0.005 && selectedId === this.lastSelected) return;
    this.lastZoom = zoom;
    this.lastSelected = selectedId;
    const heightZoom = Math.min(1.2, Math.max(0.5, zoom));
    for (const level of this.levels) {
      const style = SEVERITY_STYLES[level.severity];
      const size = Math.sqrt(style.size);
      level.anchors.forEach((anchor, index) => {
        const selected = anchor.cluster.id === selectedId ? SELECTED_SCALE : 1;
        const width = size * zoom * selected * anchor.widen;
        if (level.symbols) {
          const side = SYMBOL_SIZE * size * zoom * selected * anchor.widen;
          const radius = (side * DISC_RADIUS) / 2;
          const lift = radius * SYMBOL_LIFT;
          for (const part of level.parts) {
            if (part.kind === 'spot') scale.setScalar(width * SYMBOL_SPOT);
            else if (part.kind === 'stem') scale.set(width * STEM_WIDTH, lift, width * STEM_WIDTH);
            else scale.set(side, lift, side);
            matrix.compose(anchor.position, anchor.turn, scale);
            part.mesh.setMatrixAt(index, matrix);
          }
          const reach = radius / HIT_RADIUS;
          this.hits.get(anchor.cluster.id)?.scale.set(reach, lift + radius, reach);
          return;
        }
        const height = pillarHeight(level.severity) * heightZoom * selected;
        for (const part of level.parts) {
          if (part.kind === 'spot') scale.setScalar(width);
          else scale.set(width, height, width);
          matrix.compose(anchor.position, anchor.turn, scale);
          part.mesh.setMatrixAt(index, matrix);
        }
        this.hits.get(anchor.cluster.id)?.scale.set(width, height, width);
      });
      for (const part of level.parts) part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
