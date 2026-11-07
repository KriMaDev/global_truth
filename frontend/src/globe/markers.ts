/**
 * The severity lights: each event is a pillar of light rising from its location, with a
 * bright core, a soft outer glow and a glowing spot on the ground. Taller, wider and faster
 * pulsing with severity (see ../severity.ts); globe.gl's ring layer adds outward rings for
 * high and critical events (see globe.ts).
 *
 * Materials are shared per severity level and pulse in the shader, so a thousand events
 * still cost a handful of materials.
 */

import {
  AddEquation,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  PlaneGeometry,
  ShaderMaterial,
  Color,
  Quaternion,
  Vector3,
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
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
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

const spotVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

interface LevelMaterials {
  core: ShaderMaterial;
  glow: ShaderMaterial;
  spot: ShaderMaterial;
}

function uniformsFor(severity: Severity, strength: number) {
  return {
    color: { value: new Color(SEVERITY_STYLES[severity].color) },
    strength: { value: strength },
    time: { value: 0 },
    period: { value: SEVERITY_STYLES[severity].pulseSeconds ?? 0 },
  };
}

const materials = new Map<Severity, LevelMaterials>();

function materialsFor(severity: Severity): LevelMaterials {
  let set = materials.get(severity);
  if (!set) {
    set = {
      core: new ShaderMaterial({
        uniforms: uniformsFor(severity, 2.0),
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        ...lightBlending,
      }),
      glow: new ShaderMaterial({
        uniforms: uniformsFor(severity, 0.7),
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        ...lightBlending,
      }),
      spot: new ShaderMaterial({
        uniforms: uniformsFor(severity, 1),
        vertexShader: spotVertex,
        fragmentShader: spotFragment,
        side: DoubleSide,
        ...lightBlending,
      }),
    };
    materials.set(severity, set);
  }
  return set;
}

/** An invisible, wider column so a thin pillar is easy to click or tap. */
const hitMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// Shared geometries, built standing on the ground (y = 0) and 1 unit tall, so scaling y
// sets the height.
const coreGeometry = new CylinderGeometry(CORE_RADIUS, CORE_RADIUS * 0.6, 1, 10, 1, true).translate(0, 0.5, 0);
const glowGeometry = new CylinderGeometry(GLOW_RADIUS * 0.55, GLOW_RADIUS, 1, 20, 1, true).translate(0, 0.5, 0);
const spotGeometry = new PlaneGeometry(SPOT_SIZE, SPOT_SIZE).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
const hitGeometry = new CylinderGeometry(HIT_RADIUS, HIT_RADIUS, 1, 8).translate(0, 0.5, 0);

/** The pillar for one event, standing on the local +Y axis. */
export function createMarker(event: GlobeEvent): Group {
  const set = materialsFor(event.severity);
  const marker = new Group();
  marker.name = `event:${event.id}`;
  marker.userData.event = event;

  const spot = new Mesh(spotGeometry, set.spot);
  spot.name = "spot";
  const glow = new Mesh(glowGeometry, set.glow);
  glow.name = "glow";
  const core = new Mesh(coreGeometry, set.core);
  core.name = "core";
  const hit = new Mesh(hitGeometry, hitMaterial);
  hit.name = "hit";
  for (const part of [spot, glow, core]) part.renderOrder = 2;
  marker.add(spot, glow, core, hit);
  return marker;
}

const UP = new Vector3(0, 1, 0);
const outward = new Vector3();
const turn = new Quaternion();

/** Places a pillar at `position` (on the globe's surface), standing straight outwards. */
export function placeMarker(marker: Group, position: { x: number; y: number; z: number }): void {
  marker.position.set(position.x, position.y, position.z);
  outward.set(position.x, position.y, position.z).normalize();
  marker.quaternion.copy(turn.setFromUnitVectors(UP, outward));
}

/** Advances the shared pulse; with reduced motion the pillars stay still. */
export function updatePulse(seconds: number, reducedMotion: boolean): void {
  for (const level of SEVERITIES) {
    const set = materials.get(level);
    if (!set) continue;
    const period = reducedMotion ? 0 : (SEVERITY_STYLES[level].pulseSeconds ?? 0);
    for (const material of [set.core, set.glow, set.spot]) {
      material.uniforms.time.value = seconds;
      material.uniforms.period.value = period;
    }
  }
}

/**
 * Sets every pillar's size for this frame: its severity, the camera's distance (pillars
 * stay slim when zooming in and visible when zooming out) and the selection.
 */
export function updateMarkers(
  markers: Iterable<Group>,
  cameraDistance: number,
  selectedId: string | null,
): void {
  const zoom = Math.min(1.3, Math.max(0.3, cameraDistance / REFERENCE_DISTANCE));
  const heightZoom = Math.min(1.2, Math.max(0.5, zoom));
  for (const marker of markers) {
    const event = marker.userData.event as GlobeEvent;
    const style = SEVERITY_STYLES[event.severity];
    const selected = event.id === selectedId ? SELECTED_SCALE : 1;
    const width = Math.sqrt(style.size) * zoom * selected;
    const height = pillarHeight(event.severity) * heightZoom * selected;
    for (const part of marker.children) {
      if (part.name === "spot") part.scale.setScalar(Math.sqrt(style.size) * zoom * selected);
      else part.scale.set(width, height, width);
    }
  }
}
