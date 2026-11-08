/**
 * Draws every country and lake as one object. globe.gl makes a separate object for each island
 * and lake (about 1,400, so 1,400 draw calls a frame, against 17 in the news view). Its objects
 * stay, hidden, because clicks and hover boxes still work on them; this layer does the drawing.
 */

import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Matrix4,
  type Object3D,
} from 'three';

/** Red, green, blue (linear) and opacity. */
export type Rgba = readonly [number, number, number, number];

export interface ShapePart {
  /** What the colour is chosen by. */
  shape: unknown;
  positions: ArrayLike<number>;
  /** Vertex numbers of the triangles; null when vertices are already in triangle order. */
  index: ArrayLike<number> | null;
  matrix: Matrix4;
}

export interface MergedShapes {
  positions: Float32Array;
  index: Uint32Array;
  ranges: { shape: unknown; start: number; count: number }[];
}

/** Joins the parts into one list of vertices and triangles, each moved by its own matrix. */
export function mergeShapes(parts: ShapePart[]): MergedShapes {
  let vertices = 0;
  let indices = 0;
  for (const part of parts) {
    vertices += part.positions.length / 3;
    indices += part.index ? part.index.length : part.positions.length / 3;
  }
  const positions = new Float32Array(vertices * 3);
  const index = new Uint32Array(indices);
  const ranges: MergedShapes['ranges'] = [];
  const point = new Vector3();
  let vertex = 0;
  let cursor = 0;
  for (const part of parts) {
    const count = part.positions.length / 3;
    for (let i = 0; i < count; i += 1) {
      point
        .set(part.positions[i * 3], part.positions[i * 3 + 1], part.positions[i * 3 + 2])
        .applyMatrix4(part.matrix);
      point.toArray(positions, (vertex + i) * 3);
    }
    if (part.index) {
      for (let i = 0; i < part.index.length; i += 1) index[cursor++] = part.index[i] + vertex;
    } else {
      for (let i = 0; i < count; i += 1) index[cursor++] = i + vertex;
    }
    ranges.push({ shape: part.shape, start: vertex, count });
    vertex += count;
  }
  return { positions, index, ranges };
}

/** Writes each shape's colour on all of its vertices. */
export function paintRanges(
  colors: Float32Array,
  ranges: MergedShapes['ranges'],
  colorOf: (shape: unknown) => Rgba,
): void {
  for (const { shape, start, count } of ranges) {
    const [r, g, b, a] = colorOf(shape);
    for (let i = start; i < start + count; i += 1) {
      colors[i * 4] = r;
      colors[i * 4 + 1] = g;
      colors[i * 4 + 2] = b;
      colors[i * 4 + 3] = a;
    }
  }
}

/** The globe.gl objects of the shapes, under its polygon layer. */
export function findShapeGroups(scene: Object3D): Object3D[] {
  const groups: Object3D[] = [];
  scene.traverse((object) => {
    if ((object as { __globeObjType?: string }).__globeObjType === 'polygon') groups.push(object);
  });
  return groups;
}

export class ShapeLayer {
  readonly mesh: Mesh;
  private ranges: MergedShapes['ranges'] = [];
  private colors: BufferAttribute | null = null;

  constructor() {
    this.mesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    // After NASA's close-up tiles, before coastlines, rivers and the event markers.
    this.mesh.renderOrder = -0.5;
  }

  /** Takes over drawing from globe.gl's objects, which are hidden and stop being recalculated. */
  adopt(groups: Object3D[], colorOf: (shape: unknown) => Rgba): void {
    const root = groups[0]?.parent;
    if (!root) return;
    root.updateMatrixWorld(true);
    root.visible = false;
    root.matrixWorldAutoUpdate = false;

    const parts: ShapePart[] = [];
    for (const group of groups) {
      const mesh = group.children[0] as Mesh;
      const position = mesh.geometry?.attributes.position;
      if (!position) continue;
      parts.push({
        shape: (group as unknown as { __data: { data: unknown } }).__data.data,
        positions: position.array,
        index: mesh.geometry.index?.array ?? null,
        matrix: mesh.matrixWorld,
      });
    }
    const merged = mergeShapes(parts);
    this.ranges = merged.ranges;
    this.mesh.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(merged.positions, 3));
    geometry.setIndex(new BufferAttribute(merged.index, 1));
    this.colors = new BufferAttribute(new Float32Array((merged.positions.length / 3) * 4), 4);
    this.colors.setUsage(DynamicDrawUsage);
    geometry.setAttribute('color', this.colors);
    this.mesh.geometry = geometry;
    this.paint(colorOf);
    this.mesh.visible = true;
  }

  /** Recolours the shapes (when the events change); no geometry is rebuilt. */
  paint(colorOf: (shape: unknown) => Rgba): void {
    if (!this.colors) return;
    paintRanges(this.colors.array as Float32Array, this.ranges, colorOf);
    this.colors.needsUpdate = true;
  }

  clear(): void {
    this.mesh.visible = false;
    this.ranges = [];
    this.colors = null;
  }
}
