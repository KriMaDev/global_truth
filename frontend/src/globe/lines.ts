/**
 * Coastlines and country borders (Natural Earth, public domain), so land stays readable on
 * the night side. Faint by day, a soft glow by night: the same sun direction as the surface.
 * Data: /geo/lines.bin, made by tools/build_geo.py (layout described there).
 */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineSegments,
  ShaderMaterial,
  type Vector3,
} from 'three';

export interface GeoLines {
  coastlines: number[][][];
  borders: number[][][];
}

/** Reads lines.bin: lines as lists of [lng, lat] points. */
export function parseLines(buffer: ArrayBuffer): GeoLines {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== 'WNGL') throw new Error('lines.bin: unknown format');
  const counts = [view.getUint32(4, true), view.getUint32(8, true)];
  let offset = 12;
  const groups: number[][][][] = [];
  for (const count of counts) {
    const lines: number[][][] = [];
    for (let i = 0; i < count; i++) {
      const points = view.getUint16(offset, true);
      offset += 2;
      const line: number[][] = [];
      for (let p = 0; p < points; p++) {
        line.push([view.getInt16(offset, true) / 100, view.getInt16(offset + 2, true) / 100]);
        offset += 4;
      }
      lines.push(line);
    }
    groups.push(lines);
  }
  return { coastlines: groups[0], borders: groups[1] };
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform vec3 sunDirection;
  uniform float dayOpacity;
  uniform float nightOpacity;
  varying vec3 vWorldPosition;
  void main() {
    float light = dot(normalize(vWorldPosition), sunDirection);
    float alpha = mix(nightOpacity, dayOpacity, smoothstep(-0.15, 0.12, light));
    gl_FragColor = vec4(color, alpha);
  }
`;

function segments(
  lines: number[][][],
  coords: (lat: number, lng: number) => { x: number; y: number; z: number },
): Float32Array {
  let count = 0;
  for (const line of lines) count += Math.max(0, line.length - 1);
  const positions = new Float32Array(count * 6);
  let i = 0;
  for (const line of lines) {
    for (let p = 0; p + 1 < line.length; p++) {
      for (const [lng, lat] of [line[p], line[p + 1]]) {
        const c = coords(lat, lng);
        positions[i++] = c.x;
        positions[i++] = c.y;
        positions[i++] = c.z;
      }
    }
  }
  return positions;
}

function layer(
  lines: number[][][],
  coords: (lat: number, lng: number) => { x: number; y: number; z: number },
  sunDirection: Vector3,
  color: string,
  dayOpacity: number,
  nightOpacity: number,
): LineSegments {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(segments(lines, coords), 3));
  const material = new ShaderMaterial({
    uniforms: {
      color: { value: new Color(color) },
      sunDirection: { value: sunDirection },
      dayOpacity: { value: dayOpacity },
      nightOpacity: { value: nightOpacity },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const result = new LineSegments(geometry, material);
  result.renderOrder = 1;
  return result;
}

/** Rivers and lake shores (/geo/water.bin, the same layout: rivers first, then lake shores),
 * for the geography view. Clear blue by day, still visible at night. */
export function createWaterLines(
  data: GeoLines,
  coords: (lat: number, lng: number) => { x: number; y: number; z: number },
  sunDirection: Vector3,
): LineSegments[] {
  return [
    layer(data.coastlines, coords, sunDirection, '#4fb0ff', 0.8, 0.55),
    layer(data.borders, coords, sunDirection, '#8fd0ff', 0.65, 0.45),
  ];
}

/** The coastline and border lines, ready to add to the scene. */
export function createLines(
  data: GeoLines,
  coords: (lat: number, lng: number) => { x: number; y: number; z: number },
  sunDirection: Vector3,
): LineSegments[] {
  return [
    layer(data.coastlines, coords, sunDirection, '#9fd4ff', 0.12, 0.55),
    layer(data.borders, coords, sunDirection, '#d6dae0', 0.1, 0.3),
  ];
}
