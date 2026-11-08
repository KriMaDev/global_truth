/**
 * The symbols for natural disasters: one per disaster type (HAZARD_LABELS) and a general
 * warning sign for disasters of unknown type. Our own simple vector drawings on a 24×24 grid,
 * so no icon set or licence is involved. Each has a "main" part (drawn near-white) and an
 * "accent" part (drawn in the event's severity colour), e.g. a white cloud with a coloured
 * bolt. The same paths draw the globe's markers (a texture atlas, ./markers.ts) and the
 * legend's small SVG icons (../ui/legend.ts).
 */

import { HAZARD_LABELS, type GlobeEvent } from "../types";

export interface IconShape {
  /** An SVG path on the 24×24 grid, or a circle [cx, cy, r]. */
  d?: string;
  circle?: [number, number, number];
  layer: "main" | "accent";
  /** Filled shape; otherwise a stroke with round ends. */
  fill?: boolean;
}

export interface HazardIcon {
  code: string;
  label: string;
  shapes: IconShape[];
}

/** Stroke width on the 24×24 grid. */
export const ICON_STROKE = 1.8;

const WAVE = (y: number): string =>
  `M2 ${y}c2 0 3-1.5 5-1.5s3 1.5 5 1.5 3-1.5 5-1.5 3 1.5 5 1.5`;

const SHAPES: Record<string, IconShape[]> = {
  // Earthquake: a seismograph trace over the ground.
  EQ: [
    { d: "M2 12h3.5l2-5 3.5 11 3-8.5 2 4.5H22", layer: "main" },
    { d: "M4 20.5h16", layer: "accent" },
  ],
  // Tsunami: a curling wave over the sea.
  TS: [
    { d: "M2.5 16C5 16 6 7.5 12.5 7.5c3 0 5 2 5 4.5-1.6-1.2-4-1-5 1.2", layer: "main" },
    { d: WAVE(20.5), layer: "accent" },
  ],
  // Tropical cyclone: the weather-map sign, two arms round an eye.
  TC: [
    { circle: [12, 12, 3.4], layer: "main" },
    { d: "M9.1 10.2C8.4 6.2 11 3 15.8 2.6", layer: "main" },
    { d: "M14.9 13.8c.7 4-1.9 7.2-6.7 7.6", layer: "main" },
    { circle: [12, 12, 1.2], layer: "accent", fill: true },
  ],
  // Volcano: a mountain with an erupting crater and a lava flow.
  VO: [
    { d: "M2.5 20.5 8.5 11h7l6 9.5Z", layer: "main" },
    { d: "M12 8V3.5M8.8 7.6 7 4.8M15.2 7.6 17 4.8", layer: "accent" },
    { d: "M11.2 11l-.9 3.4 1.8 2", layer: "accent" },
  ],
  // Wildfire: a flame with a white-hot core.
  WF: [
    {
      d: "M12 2.5c.6 3.4 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.4 2.7-5.6.2 2.1 1.2 3.4 2.3 3.4-.3-3 .1-5.9.5-8.8Z",
      layer: "accent",
      fill: true,
    },
    {
      d: "M12 12.3c1.3 1.4 2.6 2.7 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.7 1.2-3 2.6-4.6Z",
      layer: "main",
      fill: true,
    },
  ],
  // Flood: a house with water rising round it.
  FL: [
    { d: "M5 12.5 12 6.5l7 6M7.5 10.6v4.4M16.5 10.6v4.4", layer: "main" },
    { d: WAVE(17.5), layer: "accent" },
    { d: WAVE(21.5), layer: "accent" },
  ],
  // Landslide: rocks tumbling down a slope.
  LS: [
    { d: "M3 20.5h18L5 6.5Z", layer: "main" },
    { circle: [10, 8.9, 1.3], layer: "accent", fill: true },
    { circle: [14, 11.6, 1.7], layer: "accent", fill: true },
    { circle: [18.4, 15.4, 2.1], layer: "accent", fill: true },
  ],
  // Avalanche: a mountain with snow pouring down its side.
  AV: [
    { d: "M2 20.5 9.5 7l4 6.5 2.5-3.5 6 10.5Z", layer: "main" },
    { d: "M7.1 11.3 9.5 9.8l2 2", layer: "accent" },
    { circle: [17.2, 15.2, 1.1], layer: "accent", fill: true },
    { circle: [19.6, 17.6, 1], layer: "accent", fill: true },
    { circle: [15.4, 18.2, 0.9], layer: "accent", fill: true },
  ],
  // Drought: a blazing sun over cracked ground.
  DR: [
    { circle: [12, 7.2, 2.9], layer: "accent" },
    { d: "M12 1.6v1.2M5.8 7.2h1.3M16.9 7.2h1.3M7.6 2.9l.9.9M16.4 2.9l-.9.9", layer: "accent" },
    { d: "M2.5 14.5h19M7 14.5l1.6 2.8-1.2 3.4M13.5 14.5l-1 2.6 2 3.6M18.5 14.5l1.2 2.4", layer: "main" },
  ],
  // Heatwave: a thermometer with rising heat.
  HW: [
    { d: "M10 4.5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0Z", layer: "main" },
    { d: "M12 9v7", layer: "accent" },
    { circle: [12, 16.8, 1.9], layer: "accent", fill: true },
    { d: "M18.5 5.5c-.9.9-.9 1.9 0 2.8s.9 1.9 0 2.8M5.5 5.5c-.9.9-.9 1.9 0 2.8s.9 1.9 0 2.8", layer: "main" },
  ],
  // Storm: a cloud with a lightning bolt.
  ST: [
    { d: "M7 16.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 7.8a3.6 3.6 0 0 1 .5 7.1", layer: "main" },
    { d: "M13 11.5 9.5 17h3.2L11 22l5-6.5h-3.3l1.8-4Z", layer: "accent", fill: true },
  ],
};

/** A natural disaster of unknown type: a warning sign. */
const GENERIC: IconShape[] = [
  { d: "M12 3.2 2.5 20h19Z", layer: "accent" },
  { d: "M12 9.5v5", layer: "main" },
  { circle: [12, 17.3, 1.1], layer: "main", fill: true },
];

export const GENERIC_CODE = "generic";

/** Every symbol, in atlas order: the disaster types, then the general warning sign. */
export const HAZARD_ICONS: HazardIcon[] = [
  ...Object.entries(HAZARD_LABELS).map(([code, label]) => ({ code, label, shapes: SHAPES[code] ?? GENERIC })),
  { code: GENERIC_CODE, label: "Other or unknown type", shapes: GENERIC },
];

/** Whether an event is shown as a disaster symbol (rather than a pillar of light). */
export function isDisaster(event: Pick<GlobeEvent, "categories">): boolean {
  return event.categories.includes("natural-disasters");
}

/** The atlas index of an event's symbol, or null for events drawn as pillars. */
export function iconIndex(event: Pick<GlobeEvent, "categories" | "hazard">): number | null {
  if (!isDisaster(event)) return null;
  const index = HAZARD_ICONS.findIndex((icon) => icon.code === event.hazard);
  return index >= 0 ? index : HAZARD_ICONS.length - 1;
}

/** Columns and rows of the texture atlas. */
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = Math.ceil(HAZARD_ICONS.length / ATLAS_COLUMNS);
/** Pixels per symbol in the atlas: sharp on large screens, mipmapped when small. */
export const ATLAS_CELL = 256;
/** Empty margin round each symbol in its cell (fraction of the cell), so mipmaps don't bleed. */
const CELL_MARGIN = 0.1;

function drawShape(ctx: CanvasRenderingContext2D, shape: IconShape): void {
  const path = new Path2D();
  if (shape.circle) {
    const [cx, cy, r] = shape.circle;
    path.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (shape.d) {
    path.addPath(new Path2D(shape.d));
  }
  if (shape.fill) ctx.fill(path);
  else ctx.stroke(path);
}

/**
 * Draws every symbol into a canvas: main parts in the red channel, accent parts in the green
 * channel, on black. The markers' shader colours them (white and the severity colour).
 */
export function drawAtlas(canvas: HTMLCanvasElement): void {
  canvas.width = ATLAS_COLUMNS * ATLAS_CELL;
  canvas.height = ATLAS_ROWS * ATLAS_CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const scale = (ATLAS_CELL * (1 - 2 * CELL_MARGIN)) / 24;
  HAZARD_ICONS.forEach((icon, index) => {
    const x = (index % ATLAS_COLUMNS) * ATLAS_CELL + ATLAS_CELL * CELL_MARGIN;
    const y = Math.floor(index / ATLAS_COLUMNS) * ATLAS_CELL + ATLAS_CELL * CELL_MARGIN;
    for (const layer of ["accent", "main"] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.lineWidth = ICON_STROKE;
      ctx.strokeStyle = ctx.fillStyle = layer === "main" ? "#f00" : "#0f0";
      for (const shape of icon.shapes) if (shape.layer === layer) drawShape(ctx, shape);
      ctx.restore();
    }
  });
}

/** The fraction of a cell the 24×24 grid fills (the shader maps the symbol onto it). */
export const ICON_FILL = 1 - 2 * CELL_MARGIN;

const SVG = "http://www.w3.org/2000/svg";

/** A small SVG of a symbol for the page (legend, cards): main parts in the current text
 * colour, accent parts in `accent`. Built with DOM calls only. */
export function iconSvg(icon: HazardIcon, accent: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "hazard-icon");
  for (const shape of icon.shapes) {
    const node = shape.circle
      ? document.createElementNS(SVG, "circle")
      : document.createElementNS(SVG, "path");
    if (shape.circle) {
      const [cx, cy, r] = shape.circle;
      node.setAttribute("cx", String(cx));
      node.setAttribute("cy", String(cy));
      node.setAttribute("r", String(r));
    } else if (shape.d) {
      node.setAttribute("d", shape.d);
    }
    const colour = shape.layer === "accent" ? accent : "currentColor";
    node.setAttribute("fill", shape.fill ? colour : "none");
    node.setAttribute("stroke", shape.fill ? "none" : colour);
    node.setAttribute("stroke-width", String(ICON_STROKE));
    node.setAttribute("stroke-linecap", "round");
    node.setAttribute("stroke-linejoin", "round");
    svg.append(node);
  }
  return svg;
}
