/**
 * The 3D globe: globe.gl with NASA day and night textures, atmosphere, stars, the severity
 * lights and rings, auto-rotation and smooth camera moves. Loaded lazily by main.ts, so the
 * page shell appears before three.js is downloaded.
 */

import Globe from "globe.gl";
import {
  SRGBColorSpace,
  TextureLoader,
  type Group,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";
import { SEVERITY_STYLES } from "../severity";
import type { GlobeEvent } from "../types";
import { createDayNightMaterial, setSunDirection } from "./daynight";
import { createMarker, updateMarkers } from "./markers";
import { createStars } from "./stars";
import { sunPosition } from "./sun";

export interface GlobeAppOptions {
  events: GlobeEvent[];
  reducedMotion: boolean;
  /** Called when a light is clicked or tapped. */
  onSelect: (event: GlobeEvent) => void;
}

export interface GlobeApp {
  flyTo(event: GlobeEvent): void;
  select(id: string | null): void;
  setReducedMotion(on: boolean): void;
  rotateBy(degreesLng: number, degreesLat: number): void;
  zoomBy(factor: number): void;
}

const BACKGROUND = "#03050b";
const ATMOSPHERE = "#7cc4ff";
const LIGHT_ALTITUDE = 0.012;
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

/** Start further out on narrow (portrait) screens, so the whole globe fits across. */
function startAltitude(): number {
  return window.innerWidth < window.innerHeight ? 3.6 : 2.4;
}

async function loadTexture(url: string, renderer: WebGLRenderer): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(url);
  texture.colorSpace = SRGBColorSpace;
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
  const markers = new Map<string, Group>();
  const ringEvents = options.events.filter((e) => SEVERITY_STYLES[e.severity].rings);

  const globe = new Globe(container, {
    animateIn: !reducedMotion,
    rendererConfig: { antialias: true, powerPreference: "high-performance" },
  });
  const renderer = globe.renderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const size = textureSize(renderer);
  const [day, night] = await Promise.all([
    loadTexture(`/textures/day-${size}.webp`, renderer),
    loadTexture(`/textures/night-${size}.webp`, renderer),
  ]);
  const material = createDayNightMaterial(day, night);
  container.dataset.textures = size;

  const resize = (): void => {
    globe.width(container.clientWidth).height(container.clientHeight);
  };
  resize();
  window.addEventListener("resize", resize);

  globe
    .backgroundColor(BACKGROUND)
    .globeMaterial(material)
    .showAtmosphere(true)
    .atmosphereColor(ATMOSPHERE)
    .atmosphereAltitude(0.17)
    .customLayerData(options.events)
    .customThreeObject((d) => {
      const event = d as GlobeEvent;
      const marker = createMarker(event);
      markers.set(event.id, marker);
      return marker;
    })
    .customThreeObjectUpdate((obj, d) => {
      const event = d as GlobeEvent;
      Object.assign(obj.position, globe.getCoords(event.lat, event.lng, LIGHT_ALTITUDE));
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

  // Pulses: one loop for every light.
  const start = performance.now();
  const tick = (now: number): void => {
    updateMarkers(markers.values(), (now - start) / 1000, camera.position.length(), reducedMotion, selectedId);
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
      const current = globe.pointOfView();
      move({ lat: event.lat, lng: event.lng, altitude: Math.min(current.altitude, 1.8) }, FLY_MS);
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
