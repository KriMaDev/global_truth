/**
 * The 3D globe: globe.gl with NASA day, night and relief textures, atmosphere, stars, the severity
 * lights and rings, auto-rotation and smooth camera moves. Loaded lazily by main.ts, so the
 * page shell appears before three.js is downloaded.
 */

import Globe from "globe.gl";
import {
  NoColorSpace,
  SRGBColorSpace,
  TextureLoader,
  type Mesh,
  type PerspectiveCamera,
  type Texture,
  type Vector3,
  type WebGLRenderer,
} from "three";
import { SEVERITY_STYLES } from "../severity";
import type { GlobeEvent } from "../types";
import { createAtmosphere } from "./atmosphere";
import { createDayNightMaterial, setSunDirection } from "./daynight";
import { PillarField } from "./markers";
import { createStars } from "./stars";
import { sunPosition } from "./sun";

export interface GlobeAppOptions {
  events: GlobeEvent[];
  reducedMotion: boolean;
  /** Called when a light is clicked or tapped. */
  onSelect: (event: GlobeEvent) => void;
  /** Called with the camera's position whenever it moves (for the readout). */
  onView?: (view: { lat: number; lng: number; altitude: number }) => void;
}

export interface GlobeApp {
  flyTo(event: GlobeEvent): void;
  select(id: string | null): void;
  setReducedMotion(on: boolean): void;
  rotateBy(degreesLng: number, degreesLat: number): void;
  zoomBy(factor: number): void;
}

/** Transparent, so the page's background and grid show behind the stars. */
const BACKGROUND = "rgba(0, 0, 0, 0)";
const GLOBE_RADIUS = 100;
/** Pillars stand on the surface (just above it, so the ground spot is not hidden). */
const LIGHT_ALTITUDE = 0.002;
const RING_ALTITUDE = 0.004;
const FLY_MS = 1400;
const STEP_MS = 350;
const AUTO_ROTATE_SPEED = 0.35;
/** Auto-rotation comes back after this long without any interaction. */
const AUTO_ROTATE_RESUME_MS = 30_000;
const SUN_UPDATE_MS = 60_000;
const MIN_ALTITUDE = 0.25;
const MAX_ALTITUDE = 5;

/** Windows at least this wide (CSS pixels) get 4K textures; phones and small tablets 2K. */
const WIDE_SCREEN = 1024;

/** 4K textures only on wide screens whose graphics chip can hold them. */
function textureSize(renderer: WebGLRenderer): "2k" | "4k" {
  return renderer.capabilities.maxTextureSize >= 4096 && window.innerWidth >= WIDE_SCREEN
    ? "4k"
    : "2k";
}

/** Degrees the camera stays south of a chosen event: more on portrait screens, where the
 * card covers the lower part. */
function viewTilt(): number {
  return window.innerWidth < window.innerHeight ? 22 : 12;
}

/** Start further out on narrow (portrait) screens, so the whole globe fits across. */
function startAltitude(): number {
  return window.innerWidth < window.innerHeight ? 3.6 : 2.4;
}

/** `color` textures are sRGB images; data textures (elevation) are read as plain numbers. */
async function loadTexture(url: string, renderer: WebGLRenderer, color = true): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(url);
  texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function ringColor(event: GlobeEvent): (t: number) => string {
  const hex = SEVERITY_STYLES[event.severity].color;
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return (t) => `rgba(${r}, ${g}, ${b}, ${((1 - t) * 0.75).toFixed(3)})`;
}

/** A hover label built from text nodes only: titles come from outside sources. */
function labelFor(event: GlobeEvent): HTMLElement {
  const label = document.createElement("div");
  label.className = "globe-label";
  const title = document.createElement("strong");
  title.textContent = event.title;
  const meta = document.createElement("span");
  meta.textContent = `${SEVERITY_STYLES[event.severity].label} · ${event.place}`;
  label.append(title, meta);
  return label;
}

export async function createGlobeApp(
  container: HTMLElement,
  options: GlobeAppOptions,
): Promise<GlobeApp> {
  let reducedMotion = options.reducedMotion;
  let selectedId: string | null = null;
  const ringEvents = options.events.filter((e) => SEVERITY_STYLES[e.severity].rings);

  // No grow-in animation: the atmosphere is a separate object and would not grow with it.
  const globe = new Globe(container, {
    animateIn: false,
    rendererConfig: { antialias: true, alpha: true, powerPreference: "high-performance" },
  });
  const renderer = globe.renderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const size = textureSize(renderer);
  const [day, night, topo] = await Promise.all([
    loadTexture(`/textures/day-${size}.webp`, renderer),
    loadTexture(`/textures/night-${size}.webp`, renderer),
    loadTexture(`/textures/topo-${size}.webp`, renderer, false),
  ]);
  const width = size === "4k" ? 4096 : 2048;
  const material = createDayNightMaterial({ day, night, topo, width, height: width / 2 });
  const sunVector = material.uniforms.sunDirection.value as Vector3;
  container.dataset.textures = size;

  const resize = (): void => {
    globe.width(container.clientWidth).height(container.clientHeight);
  };
  resize();
  window.addEventListener("resize", resize);

  // Pillars are drawn in batches; globe.gl's custom layer holds only their invisible hit columns.
  const pillars = new PillarField(options.events, (lat, lng) => globe.getCoords(lat, lng, LIGHT_ALTITUDE));
  globe.scene().add(pillars.group);

  globe
    .backgroundColor(BACKGROUND)
    .globeMaterial(material)
    .showAtmosphere(false)
    .customLayerData(options.events)
    .customThreeObject((d) => pillars.hitTarget(d as GlobeEvent))
    .customThreeObjectUpdate((obj, d) => {
      const event = d as GlobeEvent;
      pillars.placeHitTarget(obj as Mesh, globe.getCoords(event.lat, event.lng, LIGHT_ALTITUDE));
    })
    .customLayerLabel((d) => labelFor(d as GlobeEvent))
    .onCustomLayerClick((d) => options.onSelect(d as GlobeEvent))
    .ringAltitude(RING_ALTITUDE)
    .ringColor((d: object) => ringColor(d as GlobeEvent))
    .ringMaxRadius((d) => ((d as GlobeEvent).severity === "critical" ? 5 : 3.2))
    .ringPropagationSpeed((d) => ((d as GlobeEvent).severity === "critical" ? 3.2 : 2))
    .ringRepeatPeriod(
      (d: object) => (SEVERITY_STYLES[(d as GlobeEvent).severity].pulseSeconds ?? 2) * 1000,
    )
    .ringsData(reducedMotion ? [] : ringEvents);

  const camera = globe.camera() as PerspectiveCamera;
  globe.scene().add(createStars(2000, Math.min(camera.far * 0.8, 20_000)));
  globe.scene().add(createAtmosphere(GLOBE_RADIUS, sunVector));
  if (options.onView) {
    const onView = options.onView;
    globe.onZoom((pov) => onView(pov));
  }

  // The sun, now and every minute.
  const updateSun = (): void => {
    const sun = sunPosition(new Date());
    setSunDirection(material, globe.getCoords(sun.lat, sun.lng, 0));
  };
  updateSun();
  window.setInterval(updateSun, SUN_UPDATE_MS);

  // Open on the side where the day meets the night.
  const sun = sunPosition(new Date());
  globe.pointOfView({ lat: 22, lng: sun.lng + 40, altitude: startAltitude() });
  options.onView?.(globe.pointOfView());

  // Auto-rotation: slow, off with reduced motion, paused by any interaction.
  const controls = globe.controls();
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.autoRotate = !reducedMotion;
  let resumeTimer = 0;
  const pauseAutoRotate = (): void => {
    controls.autoRotate = false;
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      controls.autoRotate = !reducedMotion && selectedId === null;
    }, AUTO_ROTATE_RESUME_MS);
  };
  controls.addEventListener("start", pauseAutoRotate);

  // Pulses and pillar sizes: one loop for every light.
  const start = performance.now();
  const tick = (now: number): void => {
    pillars.pulse((now - start) / 1000, reducedMotion);
    pillars.update(camera.position.length(), selectedId);
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);

  // Nothing to draw while the tab is hidden.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) globe.pauseAnimation();
    else globe.resumeAnimation();
  });

  const move = (pov: { lat: number; lng: number; altitude: number }, ms: number): void => {
    pauseAutoRotate();
    globe.pointOfView(pov, reducedMotion ? 0 : ms);
  };

  return {
    flyTo(event) {
      // Look from a little south of the event, so its pillar is seen standing up and the
      // event sits above the screen's middle, clear of the card.
      const current = globe.pointOfView();
      const lat = Math.max(-80, Math.min(80, event.lat - viewTilt()));
      move({ lat, lng: event.lng, altitude: Math.min(current.altitude, 1.6) }, FLY_MS);
    },
    select(id) {
      selectedId = id;
      if (id !== null) pauseAutoRotate();
    },
    setReducedMotion(on) {
      reducedMotion = on;
      controls.autoRotate = !on && selectedId === null;
      globe.ringsData(on ? [] : ringEvents);
    },
    rotateBy(degreesLng, degreesLat) {
      const p = globe.pointOfView();
      const lat = Math.max(-85, Math.min(85, p.lat + degreesLat));
      move({ lat, lng: p.lng + degreesLng, altitude: p.altitude }, STEP_MS);
    },
    zoomBy(factor) {
      const p = globe.pointOfView();
      const altitude = Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, p.altitude * factor));
      move({ lat: p.lat, lng: p.lng, altitude }, STEP_MS);
    },
  };
}
