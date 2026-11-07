/**
 * The globe's surface: NASA's day image where the sun shines, its night lights where it
 * does not, blended across a soft line between them (the terminator).
 */

import { ShaderMaterial, Vector3, type Texture } from "three";

const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform vec3 sunDirection;

  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    float light = dot(normalize(vWorldNormal), sunDirection);
    vec3 day = texture2D(dayTexture, vUv).rgb;
    vec3 night = texture2D(nightTexture, vUv).rgb;

    // Soft daylight shading, so the day side has depth but stays readable.
    vec3 dayLit = day * clamp(light * 0.85 + 0.4, 0.0, 1.0);
    // City lights stand out on the dark side; a faint trace of the land keeps the
    // continents visible.
    vec3 nightLit = night * 1.6 + day * 0.03;

    float blend = smoothstep(-0.15, 0.12, light);
    gl_FragColor = vec4(mix(nightLit, dayLit, blend), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createDayNightMaterial(day: Texture, night: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      dayTexture: { value: day },
      nightTexture: { value: night },
      sunDirection: { value: new Vector3(1, 0, 0) },
    },
    vertexShader,
    fragmentShader,
  });
}

/** Points the material's sunlight along `direction` (any length; it is normalised). */
export function setSunDirection(
  material: ShaderMaterial,
  direction: { x: number; y: number; z: number },
): void {
  (material.uniforms.sunDirection.value as Vector3).set(direction.x, direction.y, direction.z).normalize();
}
