/**
 * The atmosphere: a soft glow around the globe, bright blue on the sunlit side and fading
 * to a dim violet on the night side. Shares the sun direction with the surface material.
 */

import {
  AddEquation,
  BackSide,
  Color,
  CustomBlending,
  OneFactor,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type Vector3,
} from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;

  void main() {
    vViewNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform vec3 dayColor;
  uniform vec3 nightColor;

  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;

  void main() {
    // Strongest just outside the globe's edge, fading outwards.
    float glow = pow(max(0.62 - dot(vViewNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.5);
    float sun = smoothstep(-0.35, 0.45, dot(normalize(vWorldNormal), sunDirection));
    vec3 color = mix(nightColor, dayColor, sun) * glow * mix(0.3, 1.1, sun);
    // Alpha follows the glow, so the page behind the transparent canvas still shows
    // where there is no glow.
    gl_FragColor = vec4(color, clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0));
  }
`;

/** `globeRadius` is the globe's radius in world units; `sunDirection` is shared, not copied. */
export function createAtmosphere(globeRadius: number, sunDirection: Vector3): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDirection },
      dayColor: { value: new Color('#4fa8ff') },
      nightColor: { value: new Color('#3b3f9c') },
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    // Plain addition of colour and alpha (the canvas is premultiplied and transparent).
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
    transparent: true,
    depthWrite: false,
  });
  const atmosphere = new Mesh(new SphereGeometry(globeRadius * 1.16, 96, 64), material);
  atmosphere.name = 'atmosphere';
  return atmosphere;
}
