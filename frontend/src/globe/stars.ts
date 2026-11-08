/** A subtle star field: random points on a large sphere, drawn in one call. */

import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three';

export function createStars(count: number, radius: number): Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // A uniform direction: a random height and a random angle around the axis.
    const z = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    positions.set(
      [ring * Math.cos(angle) * radius, z * radius, ring * Math.sin(angle) * radius],
      i * 3,
    );
    // Most stars faint, a few bright, with a slight blue or warm tint.
    const brightness = 0.25 + Math.random() ** 3 * 0.75;
    const tint = Math.random() * 0.12 - 0.06;
    colors.set([brightness * (1 + tint), brightness, brightness * (1 - tint)], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const stars = new Points(geometry, material);
  stars.name = 'stars';
  return stars;
}
