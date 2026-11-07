/**
 * The 3D globe: globe.gl with NASA day, night and relief textures, atmosphere, stars,
 * coastlines and borders, the severity pillars (grouped where they crowd, see ../clusters.ts)
 * with their rings and count badges, auto-rotation and smooth camera moves, and the geography
 * view (countries coloured by severity, decluttered map labels, events as dots). Loaded lazily
 * by main.ts, so the page shell appears before three.js is downloaded.
 */

import Globe from "globe.gl";
import {
  MeshBasicMaterial,
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
import {
  labelLevel,
  labelPriority,
  labelsFor,
  type GeographyData,
  type MapLabel,
} from "../geography";
import { SEVERITY_STYLES } from "../severity";
import { hazardLabel, type GlobeEvent, type Severity } from "../types";
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
  /** Geography view: a country was clicked. */
  onCountry?: (iso2: string) => void;
  /** Geography view: the lines shown under a country's name when hovering it. */
  describeCountry?: (iso2: string) => string[];
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
  /** The geography view (countries coloured by severity, map labels) with this data, or the
   * news view with null. Call again whenever the filtered events change. */
  setGeography(data: GeographyData | null, severities: Map<string, Severity>): void;
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
/** Country shapes in the geography view sit just above the coastlines. */
const COUNTRY_ALTITUDE = 0.0035;
/** Map labels this close to the globe's edge (cosine of the angle from the view's centre)
 * are hidden: they would be squeezed together there. */
const LABEL_EDGE = 0.3;
const DECLUTTER_MS = 120;
/** Screen space a count badge keeps clear of labels (half width, half height in px). */
const BADGE_HALF: [number, number] = [14, 10];
/** Panels that map labels keep clear of. */
const LABEL_OBSTACLES = ".brand h1, .preview-note, .topbar-actions > *, .legend, .bottom-right > *";
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
    meta.textContent = [hazardLabel(cluster.lead), SEVERITY_STYLES[cluster.severity].label, cluster.lead.place]
      .filter(Boolean)
      .join(" · ");
  }
  label.append(title, meta);
  return label;
}

/** What the one HTML layer holds: group count badges and, in the geography view, map labels. */
type HtmlItem =
  | { type: "badge"; cluster: Cluster; lat: number; lng: number }
  | { type: "label"; label: MapLabel; lat: number; lng: number };

/** A map label (country, ocean, sea, range, desert, peak): text only, not clickable. */
function mapLabelFor(label: MapLabel): HTMLElement {
  const element = document.createElement("div");
  element.className = `map-label kind-${label.kind}`;
  element.textContent = label.kind === "peak" ? `▲ ${label.text}` : label.text;
  element.setAttribute("aria-hidden", "true");
  return element;
}

interface CountryFeature {
  iso2: string;
  name: string;
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
}

/**
 * A country's tint: its severity colour, or a faint neutral glass without events. Five
 * shared, unlit materials for all countries (one each would cost a lot per frame), and
 * unlit so the colours read the same on the night side.
 */
const countryMaterials = new Map<Severity | "none", MeshBasicMaterial>();
function countryMaterial(severity: Severity | undefined): MeshBasicMaterial {
  const key = severity ?? "none";
  let material = countryMaterials.get(key);
  if (!material) {
    material = new MeshBasicMaterial({
      color: severity ? SEVERITY_STYLES[severity].color : "#d6dae0",
      transparent: true,
      opacity: severity ? 0.42 : 0.05,
      depthWrite: false,
    });
    countryMaterials.set(key, material);
  }
  return material;
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
  let geography: GeographyData | null = null;
  let countryFeatures: CountryFeature[] = [];
  let labelsAt = -1;
  /** The HTML layer's items, badges first, then labels by importance (for decluttering). */
  let htmlItems: HtmlItem[] = [];
  const labelElements = new Map<HtmlItem, HTMLElement>();
  const labelSizes = new WeakMap<HTMLElement, [number, number]>();

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
    .htmlLat((d) => (d as HtmlItem).lat)
    .htmlLng((d) => (d as HtmlItem).lng)
    .htmlAltitude(BADGE_ALTITUDE)
    .htmlElement((d) => {
      const item = d as HtmlItem;
      if (item.type === "badge") return badgeFor(item.cluster, options.onSelect);
      const element = mapLabelFor(item.label);
      labelElements.set(item, element);
      return element;
    })
    // Flat shapes: no sides, and no outline (the borders are drawn already, see ./lines.ts).
    .polygonSideColor(() => "")
    .polygonStrokeColor(() => "")
    .polygonAltitude(COUNTRY_ALTITUDE)
    .polygonsTransitionDuration(0)
    .polygonLabel((d) => {
      const country = d as CountryFeature;
      const label = document.createElement("div");
      label.className = "globe-label";
      const title = document.createElement("strong");
      title.textContent = country.name;
      label.append(title);
      for (const line of options.describeCountry?.(country.iso2) ?? []) {
        const span = document.createElement("span");
        span.textContent = line;
        label.append(span);
      }
      return label;
    })
    .onPolygonClick((d) => options.onCountry?.((d as CountryFeature).iso2))
    .htmlElementVisibilityModifier((el, isVisible) => {
      el.classList.toggle("is-hidden", !isVisible);
    })
    .htmlTransitionDuration(0);

  /** Rings pulse in the news view only (and never with reduced motion). */
  const ringClusters = (): Cluster[] =>
    reducedMotion || geography ? [] : clusters.filter((c) => SEVERITY_STYLES[c.severity].rings);

  /** The group badges and, in the geography view, the map labels for the current zoom. */
  const refreshHtml = (): void => {
    const items: HtmlItem[] = clusters
      .filter((c) => c.events.length > 1)
      .map((cluster) => ({ type: "badge", cluster, lat: cluster.lat, lng: cluster.lng }));
    if (geography) {
      const labels = labelsFor(globe.pointOfView().altitude, geography);
      labels.sort((a, b) => labelPriority(a) - labelPriority(b));
      for (const label of labels) items.push({ type: "label", label, lat: label.lat, lng: label.lng });
    }
    labelElements.clear();
    htmlItems = items;
    globe.htmlElementsData(items);
  };

  /**
   * Hides map labels that would overlap a more important one or a count badge, or that sit
   * near the globe's edge. Labels are placed in order of importance, so the most important
   * always shows.
   */
  const declutter = (): void => {
    const view = camera.position.clone().normalize();
    // The page's own panels (title, switches, legend, readout) are taken first, so labels
    // never sit behind them, and labels must fit inside the globe's area.
    const area = container.getBoundingClientRect();
    const placed: [number, number, number, number][] = [];
    for (const panel of document.querySelectorAll<HTMLElement>(LABEL_OBSTACLES)) {
      const r = panel.getBoundingClientRect();
      if (r.width > 0) placed.push([r.left - area.left, r.top - area.top, r.right - area.left, r.bottom - area.top]);
    }
    const inside = (box: [number, number, number, number]): boolean =>
      box[0] >= 0 && box[1] >= 0 && box[2] <= area.width && box[3] <= area.height;
    const free = (box: [number, number, number, number]): boolean =>
      !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
    for (const item of htmlItems) {
      const point = globe.getCoords(item.lat, item.lng, BADGE_ALTITUDE);
      const facing =
        (point.x * view.x + point.y * view.y + point.z * view.z) /
        Math.hypot(point.x, point.y, point.z);
      const screen = globe.getScreenCoords(item.lat, item.lng, BADGE_ALTITUDE);
      if (item.type === "badge") {
        if (facing > 0) {
          const [w, h] = BADGE_HALF;
          placed.push([screen.x - w, screen.y - h, screen.x + w, screen.y + h]);
        }
        continue;
      }
      const element = labelElements.get(item);
      if (!element) continue;
      let size = labelSizes.get(element);
      if (!size && element.offsetWidth > 0) {
        size = [element.offsetWidth / 2 + 4, element.offsetHeight / 2 + 2];
        labelSizes.set(element, size);
      }
      // On its point if there is room, else just below or above it (e.g. clear of a badge).
      let box: [number, number, number, number] | null = null;
      let shift = 0;
      if (size && facing > LABEL_EDGE) {
        for (const dy of [0, size[1] * 2, -size[1] * 2]) {
          const y = screen.y + dy;
          const candidate: [number, number, number, number] = [
            screen.x - size[0], y - size[1], screen.x + size[0], y + size[1],
          ];
          if (inside(candidate) && free(candidate)) {
            box = candidate;
            shift = dy;
            break;
          }
        }
      }
      element.classList.toggle("is-crowded", box === null);
      element.style.translate = shift ? `0 ${shift}px` : "";
      if (box) placed.push(box);
    }
  };

  /** Rebuilds the pillars, rings and badges for the current events and grouping. */
  const regroup = (): void => {
    clusters = clusterEvents(events, degrees);
    pillars.dispose();
    pillars = new PillarField(clusters, pillarCoords);
    pillars.setFlat(geography !== null);
    globe.scene().add(pillars.group);
    globe.customLayerData(clusters).ringsData(ringClusters());
    refreshHtml();
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
    if (geography && labelLevel(pov.altitude) !== labelsAt) {
      labelsAt = labelLevel(pov.altitude);
      refreshHtml();
    }
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
  let lastDeclutter = 0;
  const tick = (now: number): void => {
    if (geography && now - lastDeclutter > DECLUTTER_MS) {
      lastDeclutter = now;
      declutter();
    }
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
      globe.ringsData(ringClusters());
    },
    setGeography(data, severities) {
      const switched = (data === null) !== (geography === null);
      geography = data;
      if (data && countryFeatures.length === 0) {
        countryFeatures = data.countries.map((c) => ({
          iso2: c.iso2,
          name: c.name,
          geometry: { type: "MultiPolygon", coordinates: c.polygons },
        }));
      }
      // A new accessor function makes globe.gl recolour the existing shapes.
      globe
        .polygonCapMaterial((d) => countryMaterial(severities.get((d as CountryFeature).iso2)))
        .polygonsData(data ? countryFeatures : []);
      if (switched) {
        pillars.setFlat(data !== null);
        globe.ringsData(ringClusters());
        labelsAt = labelLevel(globe.pointOfView().altitude);
        refreshHtml();
      }
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
