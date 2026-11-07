/**
 * The globe's surface, lit by the real sun:
 * - NASA's day image where the sun shines, its night lights where it does not, blended
 *   across a soft terminator with a faint warm twilight band;
 * - relief: the land's elevation (GEBCO) tilts the surface, so mountains catch the light
 *   and cast soft shade as the sun moves;
 * - a thin blue haze at the day-side rim.
 *
 * The same shader also draws the sharp "detail patch" when zooming in (./detail.ts), with the
 * DETAIL define: its day and night images cover only the patch, relief still comes from the
 * global elevation image (through topoBounds), and it fades out at its edges and wherever a
 * tile has not loaded, so the globe beneath shows through.
 */

import { DoubleSide, ShaderMaterial, Vector2, Vector3, Vector4, type Texture } from "three";

const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D topoTexture;
  uniform vec2 texel;
  uniform vec3 sunDirection;
  uniform float reliefStrength;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  #ifdef DETAIL
    // The patch's place in the global elevation image: u, v of its south-west corner, and
    // its width and height in u, v.
    uniform vec4 topoBounds;
    // The night image may be coarser and cover a little more than the patch.
    uniform vec4 nightBounds;
    vec2 topoUv() { return topoBounds.xy + vUv * topoBounds.zw; }
    vec2 nightUv() { return nightBounds.xy + vUv * nightBounds.zw; }
  #else
    vec2 topoUv() { return vUv; }
    vec2 nightUv() { return vUv; }
  #endif

  float height(vec2 uv) { return texture2D(topoTexture, uv).r; }

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec4 daySample = texture2D(dayTexture, vUv);
    vec4 nightSample = texture2D(nightTexture, nightUv());
    vec3 day = daySample.rgb;
    vec3 night = nightSample.rgb;

    // Relief: tilt the normal against the elevation's slope. The globe's north is +Y,
    // so east is up x normal, and the texture's u runs east and v runs north.
    vec2 tuv = topoUv();
    float dhEast = height(tuv + vec2(texel.x, 0.0)) - height(tuv - vec2(texel.x, 0.0));
    float dhNorth = height(tuv + vec2(0.0, texel.y)) - height(tuv - vec2(0.0, texel.y));
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5, 0.0, 0.0));
    vec3 north = cross(n, east);
    vec3 surface = normalize(n - reliefStrength * (dhEast * east + dhNorth * north));

    float sphereLight = dot(n, sunDirection);
    float light = dot(surface, sunDirection);

    // Day: a little more colour depth, then soft sunlight on the relief.
    float luma = dot(day, vec3(0.299, 0.587, 0.114));
    vec3 graded = clamp(mix(vec3(luma), day, 1.18), 0.0, 1.0);
    graded = pow(graded, vec3(1.06));
    vec3 dayLit = graded * clamp(light * 0.95 + 0.32, 0.0, 1.15);

    // No sun glint on the sea: on a cloudless map it reads as a cloud or a storm, which
    // would mislead on a news globe.

    // Night: warm city lights, and a faint trace of the land.
    vec3 nightLit = night * vec3(1.25, 1.05, 0.8) * 1.7 + graded * 0.025;

    float blend = smoothstep(-0.16, 0.12, sphereLight);
    vec3 color = mix(nightLit, dayLit, blend);

    // Twilight: a thin warm band along the terminator.
    float twilight = exp(-pow(sphereLight * 12.0, 2.0));
    color += vec3(1.0, 0.42, 0.18) * twilight * 0.035;

    // Haze at the rim of the day side, where we look through more air.
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    color += vec3(0.35, 0.6, 1.0) * rim * 0.45 * smoothstep(-0.1, 0.5, sphereLight);

    #ifdef DETAIL
      // Only where the needed image has loaded (day where the sun shines, night where it
      // does not), fading out towards the patch's edges.
      float coverage = mix(nightSample.a, daySample.a, blend);
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      gl_FragColor = vec4(color, coverage * smoothstep(0.0, 0.04, edge));
    #else
      gl_FragColor = vec4(color, 1.0);
    #endif
    #include <colorspace_fragment>
  }
`;

export interface SurfaceTextures {
  day: Texture;
  night: Texture;
  topo: Texture;
  /** Width and height of the textures in pixels. */
  width: number;
  height: number;
}

export function createDayNightMaterial(textures: SurfaceTextures): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      dayTexture: { value: textures.day },
      nightTexture: { value: textures.night },
      topoTexture: { value: textures.topo },
      texel: { value: new Vector2(1 / textures.width, 1 / textures.height) },
      sunDirection: { value: new Vector3(1, 0, 0) },
      reliefStrength: { value: 7.0 },
    },
    vertexShader,
    fragmentShader,
  });
}

/**
 * The detail patch's material: the same shader, sharing the globe's sun, elevation image and
 * texel size (so it lights up exactly like the globe), with its own day and night images.
 * `reliefStrength` is lower, since NASA's sharp day tiles already carry relief shading.
 */
export function createDetailMaterial(base: ShaderMaterial, day: Texture, night: Texture): ShaderMaterial {
  return new ShaderMaterial({
    defines: { DETAIL: "" },
    uniforms: {
      dayTexture: { value: day },
      nightTexture: { value: night },
      topoTexture: base.uniforms.topoTexture,
      texel: base.uniforms.texel,
      sunDirection: base.uniforms.sunDirection,
      reliefStrength: { value: 2.5 },
      topoBounds: { value: new Vector4(0, 0, 1, 1) },
      nightBounds: { value: new Vector4(0, 0, 1, 1) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

/** Points the material's sunlight along `direction` (any length; it is normalised). */
export function setSunDirection(
  material: ShaderMaterial,
  direction: { x: number; y: number; z: number },
): void {
  (material.uniforms.sunDirection.value as Vector3).set(direction.x, direction.y, direction.z).normalize();
}
