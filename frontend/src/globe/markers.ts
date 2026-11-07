/**
 * The severity lights: each event is a soft halo with a bright core, coloured, sized and
 * pulsing by severity (see ../severity.ts). Rings for high and critical events are drawn by
 * globe.gl's ring layer (see globe.ts).
 */

import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Texture,
} from "three";
import { pulseScale, SEVERITY_STYLES } from "../severity";
import type { GlobeEvent } from "../types";

/** World units (the globe's radius is 100). */
const HALO_SIZE = 7;
const CORE_SIZE = 2.2;
/** Camera distance at which lights have their base size. */
const REFERENCE_DISTANCE = 350;
const SELECTED_SCALE = 1.4;

let glowTexture: Texture | null = null;

/** A radial gradient, white in the middle and clear at the edge, shared by every light. */
function getGlowTexture(): Texture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  glowTexture = new CanvasTexture(canvas);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
}

function glowSprite(color: string, opacity: number): Sprite {
  return new Sprite(
    new SpriteMaterial({
      map: getGlowTexture(),
      color,
      opacity,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
}

/** The light for one event: a halo and a core in the severity's colour. */
export function createMarker(event: GlobeEvent): Group {
  const { color } = SEVERITY_STYLES[event.severity];
  const marker = new Group();
  marker.name = `event:${event.id}`;
  marker.userData.event = event;
  const halo = glowSprite(color, 0.85);
  halo.name = "halo";
  const core = glowSprite("#ffffff", 0.9);
  core.name = "core";
  marker.add(halo, core);
  return marker;
}

/**
 * Sets every light's size for this frame: its severity size, its pulse, the camera's
 * distance (so lights keep about the same size on screen when zooming) and the selection.
 */
export function updateMarkers(
  markers: Iterable<Group>,
  seconds: number,
  cameraDistance: number,
  reducedMotion: boolean,
  selectedId: string | null,
): void {
  const zoom = Math.min(1.3, Math.max(0.2, cameraDistance / REFERENCE_DISTANCE));
  for (const marker of markers) {
    const event = marker.userData.event as GlobeEvent;
    const style = SEVERITY_STYLES[event.severity];
    const selected = event.id === selectedId ? SELECTED_SCALE : 1;
    const pulse = pulseScale(event.severity, seconds, reducedMotion);
    const base = style.size * zoom * selected;
    marker.children[0]?.scale.setScalar(HALO_SIZE * base * pulse);
    marker.children[1]?.scale.setScalar(CORE_SIZE * base);
  }
}
