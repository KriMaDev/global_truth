/**
 * The 3D globe: globe.gl with NASA day, night and relief textures, atmosphere, stars,
 * coastlines and borders, the severity pillars (grouped where they crowd, see ../clusters.ts)
 * with their rings and count badges, auto-rotation and smooth camera moves. Loaded lazily by
 * main.ts, so the page shell appears before three.js is downloaded.
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
import { clusterDegrees, clusterEvents, clusterOf, type Cluster } from "../clusters";
import { SEVERITY_STYLES } from "../severity";
import type { GlobeEvent } from "../types";
import { createAtmosphere } from "./atmosphere";
import { createDayNightMaterial, setSunDirection } from "./daynight";
import { createLines, parseLines } from "./lines";
import { PillarField } from "./markers";
import { createStars } from "./stars";
import { sunPosition } from "./sun";

export interface GlobeAppOptions {
  events: GlobeEvent[];
  reducedMotion: boolean;
  /** Called when a pillar (one event, or a group of several) is clicked or tapped. */
  onSelect: (cluster: Cluster) => void;
  /** Called with the camera's position whenever it moves (for the readout). */
  onView?: (view: { lat: number; lng: number; altitude: number }) => void;
}

export interface GlobeApp {
  /** Shows these events (after filtering), regrouped for the current zoom. */
  setEvents(events: GlobeEvent[]): void;
  /** Flies to an event (or group lead), seen from a little south so its pillar stands up. */
  flyTo(target: { lat: number; lng: number }): void;
  /** Flies straight over a point at a given altitude (for places). */
  flyOver(lat: number, lng: number, altitude: number): void;
  /** Highlights the pillar holding this event (or group), or none. */
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
/** Coastlines and borders sit just above the surface, under the pillars. */
const LINE_ALTITUDE = 0.0012;
const RING_ALTITUDE = 0.004;
const BADGE_ALTITUDE = 0.004;
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

function ringColor(cluster: Cluster): (t: number) => string {
  const hex = SEVERITY_STYLES[cluster.severity].color;
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return (t) => `rgba(${r}, ${g}, ${b}, ${((1 - t) * 0.75).toFixed(3)})`;
}

/** A hover label built from text nodes only: titles come from outside sources. */
function labelFor(cluster: Cluster): HTMLElement {
  const label = document.createElement("div");
  label.className = "globe-label";
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  if (cluster.events.length > 1) {
    title.textContent = `${cluster.events.length} events near ${cluster.lead.place}`;
    meta.textContent = `Most severe: ${SEVERITY_STYLES[cluster.severity].label} · click to list them`;
  } else {
    title.textContent = cluster.lead.title;
    meta.textContent = `${SEVERITY_STYLES[cluster.severity].label} · ${cluster.lead.place}`;
  }
  label.append(title, meta);
  return label;
}

/** The count badge at the foot of a group's pillar: a clear click target for the group.
 * Not in the Tab order (keyboard users reach every event through the event list). */
function badgeFor(cluster: Cluster, onSelect: (cluster: Cluster) => void): HTMLElement {
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "cluster-badge";
  badge.tabIndex = -1;
  badge.textContent = String(cluster.events.length);
  badge.title = `${cluster.events.length} events near ${cluster.lead.place}`;
  badge.style.setProperty("--dot-color", SEVERITY_STYLES[cluster.severity].color);
  badge.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(cluster);
  });
  return badge;
}

export async function createGlobeApp(
  container: HTMLElement,
  options: GlobeAppOptions,
): Promise<GlobeApp> {
  let reducedMotion = options.reducedMotion;
  let selectedId: string | null = null;
  let events = options.events;
  let degrees = -1;
  let clusters: Cluster[] = [];

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

  const pillarCoords = (lat: number, lng: number) => globe.getCoords(lat, lng, LIGHT_ALTITUDE);
  let pillars = new PillarField([], pillarCoords);

  globe
    .backgroundColor(BACKGROUND)
    .globeMaterial(material)
    .showAtmosphere(false)
    .customThreeObject((d) => pillars.hitTarget(d as Cluster))
    .customThreeObjectUpdate((obj, d) => {
      const cluster = d as Cluster;
      pillars.placeHitTarget(obj as Mesh, globe.getCoords(cluster.lat, cluster.lng, LIGHT_ALTITUDE));
    })
    .customLayerLabel((d) => labelFor(d as Cluster))
    .onCustomLayerClick((d) => options.onSelect(d as Cluster))
    .ringAltitude(RING_ALTITUDE)
    .ringColor((d: object) => ringColor(d as Cluster))
    .ringMaxRadius((d) => ((d as Cluster).severity === "critical" ? 5 : 3.2))
    .ringPropagationSpeed((d) => ((d as Cluster).severity === "critical" ? 3.2 : 2))
    .ringRepeatPeriod(
      (d: object) => (SEVERITY_STYLES[(d as Cluster).severity].pulseSeconds ?? 2) * 1000,
    )
    .htmlLat((d) => (d as Cluster).lat)
    .htmlLng((d) => (d as Cluster).lng)
    .htmlAltitude(BADGE_ALTITUDE)
    .htmlElement((d) => badgeFor(d as Cluster, options.onSelect))
    .htmlElementVisibilityModifier((el, isVisible) => {
      el.classList.toggle("is-hidden", !isVisible);
    })
    .htmlTransitionDuration(0);

  /** Rebuilds the pillars, rings and badges for the current events and grouping. */
  const regroup = (): void => {
    clusters = clusterEvents(events, degrees);
    pillars.dispose();
    pillars = new PillarField(clusters, pillarCoords);
    globe.scene().add(pillars.group);
    globe
      .customLayerData(clusters)
      .ringsData(reducedMotion ? [] : clusters.filter((c) => SEVERITY_STYLES[c.severity].rings))
      .htmlElementsData(clusters.filter((c) => c.events.length > 1));
  };

  /** Regroups only when the zoom crosses a grouping step. */
  const regroupForAltitude = (altitude: number): void => {
    const next = clusterDegrees(altitude);
    if (next === degrees) return;
    degrees = next;
    regroup();
  };

  const camera = globe.camera() as PerspectiveCamera;
  globe.scene().add(createStars(2000, Math.min(camera.far * 0.8, 20_000)));
  globe.scene().add(createAtmosphere(GLOBE_RADIUS, sunVector));

  // Coastlines and borders: loaded after the globe shows; the globe works without them.
  void fetch("/geo/lines.bin")
    .then((response) =>
      response.ok ? response.arrayBuffer() : Promise.reject(new Error(`HTTP ${response.status}`)),
    )
    .then((buffer) => {
      const coords = (lat: number, lng: number) => globe.getCoords(lat, lng, LINE_ALTITUDE);
      for (const lines of createLines(parseLines(buffer), coords, sunVector)) globe.scene().add(lines);
    })
    .catch((error: unknown) => console.warn("Coastlines and borders unavailable:", error));

  globe.onZoom((pov) => {
    regroupForAltitude(pov.altitude);
    options.onView?.(pov);
  });

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
  regroupForAltitude(globe.pointOfView().altitude);
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
    const highlighted = selectedId ? (clusterOf(clusters, selectedId)?.id ?? selectedId) : null;
    pillars.update(camera.position.length(), highlighted);
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
    setEvents(next) {
      events = next;
      regroup();
    },
    flyTo(target) {
      // Look from a little south of the target, so its pillar is seen standing up and it
      // sits above the screen's middle, clear of the card.
      const current = globe.pointOfView();
      const lat = Math.max(-80, Math.min(80, target.lat - viewTilt()));
      move({ lat, lng: target.lng, altitude: Math.min(current.altitude, 1.6) }, FLY_MS);
    },
    flyOver(lat, lng, altitude) {
      move({ lat, lng, altitude: Math.max(MIN_ALTITUDE, Math.min(MAX_ALTITUDE, altitude)) }, FLY_MS);
    },
    select(id) {
      selectedId = id;
      if (id !== null) pauseAutoRotate();
    },
    setReducedMotion(on) {
      reducedMotion = on;
      controls.autoRotate = !on && selectedId === null;
      globe.ringsData(on ? [] : clusters.filter((c) => SEVERITY_STYLES[c.severity].rings));
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
