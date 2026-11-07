/**
 * The severity lights: each event is a pillar of light rising from its location, with a
 * bright core, a soft outer glow and a glowing spot on the ground. Taller, wider and faster
 * pulsing with severity (see ../severity.ts); globe.gl's ring layer adds outward rings for
 * high and critical events (see globe.ts).
 *
 * Drawn with instancing: all pillars of one severity share one mesh per part, so a thousand
 * events cost twelve draw calls. Clicking and hovering use a separate invisible column per
 * event, handed to globe.gl's custom layer (hidden objects are still hit-tested, and the
 * globe itself blocks events on its far side).
 */

import {
  AddEquation,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
} from "three";
import { SEVERITY_STYLES } from "../severity";
import { SEVERITIES, type GlobeEvent, type Severity } from "../types";

/** World units; the globe's radius is 100. */
const BASE_HEIGHT = 8;
const CORE_RADIUS = 0.45;
const GLOW_RADIUS = 2.1;
const SPOT_SIZE = 6.5;
const HIT_RADIUS = 2.6;
/** Camera distance at which pillars have their base width. */
const REFERENCE_DISTANCE = 350;
const SELECTED_SCALE = 1.35;

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
const coreGeometry = new CylinderGeometry(CORE_RADIUS, CORE_RADIUS * 0.6, 1, 10, 1, true).translate(0, 0.5, 0);
const glowGeometry = new CylinderGeometry(GLOW_RADIUS * 0.55, GLOW_RADIUS, 1, 20, 1, true).translate(0, 0.5, 0);
const spotGeometry = new PlaneGeometry(SPOT_SIZE, SPOT_SIZE).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
const hitGeometry = new CylinderGeometry(HIT_RADIUS, HIT_RADIUS, 1, 8).translate(0, 0.5, 0);
const hitMaterial = new MeshBasicMaterial();

interface Anchor {
  event: GlobeEvent;
  position: Vector3;
  turn: Quaternion;
}

interface Level {
  anchors: Anchor[];
  parts: { mesh: InstancedMesh; kind: "beam" | "spot" }[];
  materials: ShaderMaterial[];
}

const UP = new Vector3(0, 1, 0);
const matrix = new Matrix4();
const scale = new Vector3();

/** Every pillar on the globe, drawn in a handful of instanced meshes. */
export class PillarField {
  readonly group = new Group();
  private readonly levels = new Map<Severity, Level>();
  private readonly hits = new Map<string, Mesh>();
  private lastZoom = -1;
  private lastSelected: string | null = null;

  /** `coords` turns latitude and longitude into a point on the globe's surface. */
  constructor(
    events: GlobeEvent[],
    coords: (lat: number, lng: number) => { x: number; y: number; z: number },
  ) {
    this.group.name = "pillars";
    for (const severity of SEVERITIES) {
      const anchors = events
        .filter((e) => e.severity === severity)
        .map((event) => {
          const p = coords(event.lat, event.lng);
          const position = new Vector3(p.x, p.y, p.z);
          return { event, position, turn: new Quaternion().setFromUnitVectors(UP, position.clone().normalize()) };
        });
      if (anchors.length === 0) continue;
      const core = new ShaderMaterial({ uniforms: uniformsFor(severity, 2.0), vertexShader: beamVertex, fragmentShader: beamFragment, ...lightBlending });
      const glow = new ShaderMaterial({ uniforms: uniformsFor(severity, 0.7), vertexShader: beamVertex, fragmentShader: beamFragment, ...lightBlending });
      const spot = new ShaderMaterial({ uniforms: uniformsFor(severity, 1), vertexShader: spotVertex, fragmentShader: spotFragment, side: DoubleSide, ...lightBlending });
      const make = (geometry: BufferGeometry, material: ShaderMaterial): InstancedMesh => {
        const mesh = new InstancedMesh(geometry, material, anchors.length);
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        this.group.add(mesh);
        return mesh;
      };
      this.levels.set(severity, {
        anchors,
        parts: [
          { mesh: make(spotGeometry, spot), kind: "spot" },
          { mesh: make(glowGeometry, glow), kind: "beam" },
          { mesh: make(coreGeometry, core), kind: "beam" },
        ],
        materials: [core, glow, spot],
      });
    }
  }

  /** The invisible, easy-to-hit column for one event (for globe.gl's custom layer). */
  hitTarget(event: GlobeEvent): Mesh {
    const hit = new Mesh(hitGeometry, hitMaterial);
    hit.visible = false;
    hit.name = `event:${event.id}`;
    hit.userData.event = event;
    this.hits.set(event.id, hit);
    return hit;
  }

  /** Places an event's hit column on the surface, standing straight outwards. */
  placeHitTarget(hit: Mesh, position: { x: number; y: number; z: number }): void {
    hit.position.set(position.x, position.y, position.z);
    hit.quaternion.setFromUnitVectors(UP, hit.position.clone().normalize());
  }

  /** Advances the shared pulse; with reduced motion the pillars stay still. */
  pulse(seconds: number, reducedMotion: boolean): void {
    for (const [severity, level] of this.levels) {
      const period = reducedMotion ? 0 : (SEVERITY_STYLES[severity].pulseSeconds ?? 0);
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
    for (const [severity, level] of this.levels) {
      const size = Math.sqrt(SEVERITY_STYLES[severity].size);
      level.anchors.forEach((anchor, index) => {
        const selected = anchor.event.id === selectedId ? SELECTED_SCALE : 1;
        const width = size * zoom * selected;
        const height = pillarHeight(severity) * heightZoom * selected;
        for (const part of level.parts) {
          if (part.kind === "spot") scale.setScalar(width);
          else scale.set(width, height, width);
          matrix.compose(anchor.position, anchor.turn, scale);
          part.mesh.setMatrixAt(index, matrix);
        }
        this.hits.get(anchor.event.id)?.scale.set(width, height, width);
      });
      for (const part of level.parts) part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
