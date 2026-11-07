/**
 * Sharp Earth images when zooming in: a "detail patch" of the sphere over the area in view,
 * painted with NASA GIBS map tiles at up to 500 m per pixel (the base globe's images are about
 * 10 km per pixel). Day: Blue Marble with shaded relief and bathymetry (the same imagery as
 * the globe's day image). Night: Black Marble 2016 (the same as its night lights).
 *
 * The patch uses the globe's own day/night shader (./daynight.ts, DETAIL), so the sun, the
 * terminator and the colours carry on seamlessly; it fades out at its edges and wherever a
 * tile has not loaded, so the globe beneath always shows through. Each tile loads only the
 * image it needs: day where the sun shines, night where it does not, both at twilight.
 *
 * Tiles load straight from gibs.earthdata.nasa.gov (owner's decision, 7 Nov 2026; stated on
 * the Legal page and allowed by the CSP in frontend/public/_headers).
 */

import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  SRGBColorSpace,
  type ShaderMaterial,
  type Vector3,
  type Vector4,
  type WebGLRenderer,
} from "three";
import { createDetailMaterial } from "./daynight";

export const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";
export const LAYERS = {
  day: { id: "BlueMarble_ShadedRelief_Bathymetry", ext: "jpeg" },
  night: { id: "VIIRS_Black_Marble", ext: "png" },
} as const;
export type LayerName = keyof typeof LAYERS;

/** The patch shows below this altitude (globe radii above the surface). */
export const DETAIL_ALTITUDE = 1.0;
export const TILE_PX = 512;
/** GIBS's 500 m tile matrix: level 4 is 3.9 km per pixel, level 7 0.49 km. */
export const MIN_LEVEL = 4;
export const MAX_LEVEL = 7;
/** Night tiles are PNGs of up to 450 KB each; 1 km per pixel (level 6) is still about three
 * times sharper than the night image's 3 km source, at a quarter of the tiles. */
export const NIGHT_MAX_LEVEL = 6;
/** Below level 5 the night tiles add little to the globe's own night image (which shows
 * through the patch where it has no night tiles), at several MB per view. */
export const NIGHT_MIN_LEVEL = 5;
const EARTH_KM = 6371;
const KM_PER_DEGREE = 111.32;
/** How much more than the view the patch covers, so moving a little needs no new tiles. */
const MARGIN = 1.4;

/** GIBS EPSG:4326 tiles start at (-180°, 90°) and span 288 / 2^level degrees. */
export function tileDegrees(level: number): number {
  return 288 / 2 ** level;
}

/** Kilometres per pixel of a tile at a level. */
export function tileKmPerPixel(level: number): number {
  return (tileDegrees(level) / TILE_PX) * KM_PER_DEGREE;
}

/** Kilometres the screen shows per (device) pixel at the centre of the view. */
export function screenKmPerPixel(altitude: number, fovDegrees: number, screenPx: number): number {
  return (2 * altitude * EARTH_KM * Math.tan(((fovDegrees / 2) * Math.PI) / 180)) / screenPx;
}

/** The coarsest level that is still as sharp as the screen (at most MAX_LEVEL). */
export function levelFor(kmPerPixel: number): number {
  for (let level = MIN_LEVEL; level < MAX_LEVEL; level++) {
    if (tileKmPerPixel(level) <= kmPerPixel) return level;
  }
  return MAX_LEVEL;
}

export interface TileWindow {
  level: number;
  /** First and last rows (from the north) and columns (from -180°; may run past either
   * end of the map, wrapped by tileUrl), inclusive. */
  row0: number;
  row1: number;
  col0: number;
  col1: number;
}

/** The window's edges in degrees (west and east may lie beyond ±180°). */
export function windowBounds(w: TileWindow): { west: number; east: number; south: number; north: number } {
  const size = tileDegrees(w.level);
  return {
    west: -180 + w.col0 * size,
    east: -180 + (w.col1 + 1) * size,
    north: 90 - w.row0 * size,
    south: 90 - (w.row1 + 1) * size,
  };
}

/**
 * The tiles covering the view around (lat, lng), at the sharpest level that fits in
 * `maxTiles` per side, or null when even the coarsest level would need more (the view is so
 * wide that the globe's own images serve it well). `halfHeight` is half the view's height in
 * degrees of arc; `aspect` is the screen's width / height.
 */
export function tileWindow(
  lat: number,
  lng: number,
  halfHeight: number,
  aspect: number,
  level: number,
  maxTiles: number,
): TileWindow | null {
  const halfLat = Math.min(90, halfHeight * MARGIN);
  const halfLng = Math.min(180, (halfHeight * MARGIN * Math.max(1, aspect)) / Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  for (let l = level; ; l--) {
    const size = tileDegrees(l);
    const rows = Math.round(180 / size);
    const row0 = Math.max(0, Math.floor((90 - Math.min(90, lat + halfLat)) / size));
    const row1 = Math.min(rows - 1, Math.floor((90 - Math.max(-90, lat - halfLat)) / size - 1e-9));
    const col0 = Math.floor((lng - halfLng + 180) / size);
    const col1 = Math.floor((lng + halfLng + 180) / size - 1e-9);
    if (row1 - row0 + 1 <= maxTiles && col1 - col0 + 1 <= maxTiles) return { level: l, row0, row1, col0, col1 };
    if (l <= MIN_LEVEL) return null;
  }
}

/** The tiles at `level` that cover an area (for the coarser night image). */
export function coverWindow(
  area: { west: number; east: number; south: number; north: number },
  level: number,
): TileWindow {
  const size = tileDegrees(level);
  return {
    level,
    row0: Math.floor((90 - area.north) / size + 1e-9),
    row1: Math.floor((90 - area.south) / size - 1e-9),
    col0: Math.floor((area.west + 180) / size + 1e-9),
    col1: Math.floor((area.east + 180) / size - 1e-9),
  };
}

/** Where `inner` lies within `outer`, as uv offset and scale (u runs east, v north). */
export function uvWithin(
  inner: { west: number; east: number; south: number; north: number },
  outer: { west: number; east: number; south: number; north: number },
): [number, number, number, number] {
  const width = outer.east - outer.west;
  const height = outer.north - outer.south;
  return [
    (inner.west - outer.west) / width,
    (inner.south - outer.south) / height,
    (inner.east - inner.west) / width,
    (inner.north - inner.south) / height,
  ];
}

/** A tile's address on GIBS (columns wrap around the date line). */
export function tileUrl(layer: LayerName, level: number, row: number, col: number): string {
  const cols = Math.round(360 / tileDegrees(level));
  const wrapped = ((col % cols) + cols) % cols;
  const { id, ext } = LAYERS[layer];
  return `${GIBS}/${id}/default/default/500m/${level}/${row}/${wrapped}.${ext}`;
}

/** Half the view's height in degrees of arc, at an altitude (never past the horizon). */
export function viewHalfHeight(altitude: number, fovDegrees: number): number {
  const angle = altitude * Math.tan(((fovDegrees / 2) * Math.PI) / 180);
  const horizon = Math.acos(1 / (1 + altitude));
  return (Math.min(angle, horizon) * 180) / Math.PI;
}

/** Same window (level and tiles)? */
function sameWindow(a: TileWindow | null, b: TileWindow | null): boolean {
  return !!a && !!b && a.level === b.level && a.row0 === b.row0 && a.row1 === b.row1 && a.col0 === b.col0 && a.col1 === b.col1;
}

interface DetailOptions {
  base: ShaderMaterial;
  renderer: WebGLRenderer;
  /** Latitude, longitude and altitude to a point in the scene (globe.getCoords). */
  coords: (lat: number, lng: number, altitude: number) => { x: number; y: number; z: number };
  sun: Vector3;
  /** Tiles per side at most (6 on desktops, 4 on phones). */
  maxTiles: number;
  /** Called once, when the first tile is on the globe. */
  onFirstTile: () => void;
}

/** Just above the surface, under the coastlines (0.0012) and pillars. */
const PATCH_ALTITUDE = 0.0003;
const SEGMENTS = 48;
const MAX_PARALLEL = 6;
const UPLOAD_MS = 250;
/** After this many failed tiles in a row, no tiles are asked for during a few minutes. */
const GIVE_UP_AFTER = 4;
const PAUSE_AFTER_FAILURES_MS = 5 * 60_000;
/** Tiles load once the camera pauses, so zooming through levels does not fetch them all. */
const DEBOUNCE_MS = 450;

interface Job {
  url: string;
  layer: LayerName;
  x: number;
  y: number;
  distance: number;
}

export class DetailLayer {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly canvases: Record<LayerName, HTMLCanvasElement>;
  private readonly textures: Record<LayerName, CanvasTexture>;
  private readonly cache = new Map<string, HTMLImageElement>();
  private readonly cacheSize: number;
  private window: TileWindow | null = null;
  private generation = 0;
  private queue: Job[] = [];
  private inFlight = 0;
  private dirty = false;
  private lastUpload = 0;
  private timer = 0;
  private gotFirst = false;
  private failures = 0;
  private pausedUntil = 0;

  constructor(private readonly options: DetailOptions) {
    const canvas = (): HTMLCanvasElement => {
      const element = document.createElement("canvas");
      element.width = element.height = TILE_PX;
      return element;
    };
    this.canvases = { day: canvas(), night: canvas() };
    const texture = (element: HTMLCanvasElement): CanvasTexture => {
      const t = new CanvasTexture(element);
      t.colorSpace = SRGBColorSpace;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = Math.min(8, options.renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    this.textures = { day: texture(this.canvases.day), night: texture(this.canvases.night) };
    this.material = createDetailMaterial(options.base, this.textures.day, this.textures.night);
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.visible = false;
    // Drawn before the other see-through layers (coastlines, borders, country colours,
    // pillars), so they stay on top of it.
    this.mesh.renderOrder = -1;
    this.cacheSize = options.maxTiles * options.maxTiles * 3;
  }

  /** The camera moved: after a short pause, cover the new view. */
  update(view: { lat: number; lng: number; altitude: number }, fovDegrees: number, aspect: number, screenPx: number): void {
    window.clearTimeout(this.timer);
    if (view.altitude >= DETAIL_ALTITUDE || Date.now() < this.pausedUntil) {
      this.hide();
      return;
    }
    this.timer = window.setTimeout(() => {
      const level = levelFor(screenKmPerPixel(view.altitude, fovDegrees, screenPx));
      const next = tileWindow(view.lat, view.lng, viewHalfHeight(view.altitude, fovDegrees), aspect, level, this.options.maxTiles);
      if (!next) this.hide();
      else if (!sameWindow(this.window, next)) this.show(next);
    }, DEBOUNCE_MS);
  }

  /** Once a frame: hands newly drawn tiles to the graphics card, a few times a second. */
  tick(now: number): void {
    if (!this.dirty || now - this.lastUpload < UPLOAD_MS) return;
    this.dirty = false;
    this.lastUpload = now;
    this.textures.day.needsUpdate = true;
    this.textures.night.needsUpdate = true;
  }

  private hide(): void {
    this.mesh.visible = false;
    this.window = null;
    this.queue = [];
    this.generation++;
  }

  private show(w: TileWindow): void {
    this.window = w;
    this.generation++;
    const bounds = windowBounds(w);
    const windows: Record<LayerName, TileWindow> = {
      day: w,
      night: w.level > NIGHT_MAX_LEVEL ? coverWindow(bounds, NIGHT_MAX_LEVEL) : w,
    };
    for (const layer of ["day", "night"] as const) {
      const canvas = this.canvases[layer];
      canvas.width = (windows[layer].col1 - windows[layer].col0 + 1) * TILE_PX;
      canvas.height = (windows[layer].row1 - windows[layer].row0 + 1) * TILE_PX;
      // A new size needs a new texture on the graphics card.
      this.textures[layer].dispose();
    }
    this.buildGeometry(w);
    (this.material.uniforms.nightBounds.value as Vector4).set(...uvWithin(bounds, windowBounds(windows.night)));

    // Which tiles to fetch: the needed image of each, nearest the middle first.
    const jobs: Job[] = [];
    for (const layer of ["day", "night"] as const) {
      const lw = windows[layer];
      const size = tileDegrees(lw.level);
      const scale = 2 ** (w.level - lw.level);
      const centreRow = (lw.row0 + lw.row1) / 2;
      const centreCol = (lw.col0 + lw.col1) / 2;
      for (let row = lw.row0; row <= lw.row1; row++) {
        for (let col = lw.col0; col <= lw.col1; col++) {
          if (layer === "night" && w.level < NIGHT_MIN_LEVEL) continue;
          if (!this.needed(90 - row * size, -180 + col * size, size)[layer]) continue;
          jobs.push({
            url: tileUrl(layer, lw.level, row, col),
            layer,
            x: (col - lw.col0) * TILE_PX,
            y: (row - lw.row0) * TILE_PX,
            distance: Math.hypot(row - centreRow, col - centreCol) * scale,
          });
        }
      }
    }
    // Nothing to load yet (e.g. a coarse view on the night side), but no tile has shown so
    // far: fetch the middle day tile (about 30 KB) to learn that GIBS can be reached, which
    // lets the camera zoom closer (onFirstTile).
    if (jobs.length === 0 && !this.gotFirst) {
      const row = Math.round((w.row0 + w.row1) / 2);
      const col = Math.round((w.col0 + w.col1) / 2);
      jobs.push({
        url: tileUrl("day", w.level, row, col),
        layer: "day",
        x: (col - w.col0) * TILE_PX,
        y: (row - w.row0) * TILE_PX,
        distance: 0,
      });
    }
    jobs.sort((a, b) => a.distance - b.distance);
    this.queue = [];
    for (const job of jobs) {
      const cached = this.cache.get(job.url);
      if (cached) this.draw(job, cached);
      else this.queue.push(job);
    }
    this.dirty = true;
    this.lastUpload = 0;
    this.mesh.visible = true;
    this.pump();
  }

  /** Whether a tile (north-west corner, size in degrees) needs its day or night image. */
  private needed(north: number, west: number, size: number): { day: boolean; night: boolean } {
    let min = Infinity;
    let max = -Infinity;
    const sun = this.options.sun;
    for (const [dy, dx] of [[0, 0], [0, 1], [1, 0], [1, 1], [0.5, 0.5]]) {
      const p = this.options.coords(north - dy * size, west + dx * size, 0);
      const dot = (p.x * sun.x + p.y * sun.y + p.z * sun.z) / Math.hypot(p.x, p.y, p.z);
      min = Math.min(min, dot);
      max = Math.max(max, dot);
    }
    // The shader blends day and night between -0.16 and 0.12 (./daynight.ts).
    return { day: max > -0.18, night: min < 0.14 };
  }

  private pump(): void {
    while (this.inFlight < MAX_PARALLEL && this.queue.length) {
      const job = this.queue.shift()!;
      const generation = this.generation;
      this.inFlight++;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.src = job.url;
      image
        .decode()
        .then(() => {
          this.failures = 0;
          this.remember(job.url, image);
          if (generation === this.generation) this.draw(job, image);
        })
        .catch(() => {
          // A missing tile simply leaves the globe beneath visible. If GIBS cannot be
          // reached at all (offline, blocked), stop asking for a while.
          this.failures++;
          if (this.failures >= GIVE_UP_AFTER) {
            this.pausedUntil = Date.now() + PAUSE_AFTER_FAILURES_MS;
            this.failures = 0;
            this.hide();
          }
        })
        .finally(() => {
          this.inFlight--;
          this.pump();
        });
    }
  }

  private draw(job: Job, image: HTMLImageElement): void {
    this.canvases[job.layer].getContext("2d")?.drawImage(image, job.x, job.y, TILE_PX, TILE_PX);
    this.dirty = true;
    if (!this.gotFirst) {
      this.gotFirst = true;
      this.options.onFirstTile();
    }
  }

  private remember(url: string, image: HTMLImageElement): void {
    this.cache.delete(url);
    this.cache.set(url, image);
    while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
  }

  /** A grid of points over the window, on the sphere, with uv running east and north. */
  private buildGeometry(w: TileWindow): void {
    const { west, east, south, north } = windowBounds(w);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let j = 0; j <= SEGMENTS; j++) {
      const v = j / SEGMENTS;
      const lat = south + (north - south) * v;
      for (let i = 0; i <= SEGMENTS; i++) {
        const u = i / SEGMENTS;
        const p = this.options.coords(lat, west + (east - west) * u, PATCH_ALTITUDE);
        const length = Math.hypot(p.x, p.y, p.z);
        positions.push(p.x, p.y, p.z);
        normals.push(p.x / length, p.y / length, p.z / length);
        uvs.push(u, v);
      }
    }
    const index: number[] = [];
    const row = SEGMENTS + 1;
    for (let j = 0; j < SEGMENTS; j++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a = j * row + i;
        index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    (this.material.uniforms.topoBounds.value as Vector4).set(
      (west + 180) / 360,
      (south + 90) / 180,
      (east - west) / 360,
      (north - south) / 180,
    );
  }
}
