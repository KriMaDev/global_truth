/**
 * Stands in for `three/webgpu`, `three/tsl` and `h3-js` in the build (vite.config.ts). globe.gl's libraries
 * import them for an option this site never uses, and they would add megabytes to the download.
 */
export class WebGPURenderer {
  constructor() {
    throw new Error('This site draws with WebGL.');
  }
}

export class StorageInstancedBufferAttribute {}

function unused(): never {
  throw new Error('This site does not draw hexagons.');
}

/** h3-js, used only by globe.gl's hexagon layers. */
export const latLngToCell = unused;
export const cellToLatLng = unused;
export const cellToBoundary = unused;
export const polygonToCells = unused;
