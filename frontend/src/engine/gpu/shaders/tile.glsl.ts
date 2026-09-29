// The tile shaders (ARCHITECTURE §6.3), GLSL ES 3.00 through ShaderMaterial({ glslVersion: THREE.GLSL3 }).
// Kept as TypeScript strings so vite and vitest load them the same way. The truth chunk follows §6.3's
// signatures; sampleTile is a flat colour per kind (no textures: 5,000 tiles in one draw call on SwiftShader),
// so the chroma split, which needs a second texture sample, is folded into the grain.

export const TRUTH_CHUNK = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uTruth, uTruthPrev, uTimes;
uniform float uTime, uTickT, uTickSeconds, uAltitude, uReducedMotion, uPxPerUnit, uDpr, uHatchWeight, uBurnRef;
uniform vec3 uFogTint;
uniform vec4 uPulses[16];
uniform vec4 uPulseData[16];
#define HEX_FLAT 10.392
struct Truth { float phi, phiPrev, purse, purseP, heat, variance, syncT, packT, haltT; int status; bool held; };
Truth fetchTruth(float slot) {
  ivec2 tc = ivec2(int(slot) & 255, int(slot) >> 8);
  vec4 a = texelFetch(uTruth, tc, 0), p = texelFetch(uTruthPrev, tc, 0), t = texelFetch(uTimes, tc, 0);
  Truth r; r.phi = a.r; r.phiPrev = p.r; r.purse = a.g; r.purseP = p.g; r.heat = a.b;
  int code = int(a.a + 0.5); r.held = code >= 8; r.status = code & 7;
  r.syncT = t.r; r.packT = t.g; r.haltT = t.b; r.variance = t.a; return r;
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }                                   // sRGB literal → linear
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float blendT() { return smoothstep(0.0, 1.0, clamp((uTime - uTickT) / uTickSeconds, 0.0, 1.0)); }
`;

export const TILE_VERT = /* glsl */ `
${TRUTH_CHUNK}
in vec2 uvC;
in float side;
in float aSlot, aKind, aSeed, aStreet, aSage;
in vec3 aDye;
in vec2 aAxial;
out vec2 vUvC;
out float vSide, vSlot, vKind, vSeed, vStreet, vY, vSage;
out vec3 vDye;
out vec2 vAxial;
out vec3 vNormalW;
void main() {
  vUvC = uvC; vSide = side; vSlot = aSlot; vKind = aKind; vSeed = aSeed; vAxial = aAxial; vStreet = aStreet; vSage = aSage; vDye = aDye;
  vec3 p = position;
  // PACKED folds a house cell into statistical stasis: y-scale 0.05 over 600 ms from packT (DESIGN §7, §10).
  if (aSlot >= 0.0) {
    Truth t = fetchTruth(aSlot);
    float k = clamp((uTime - t.packT) / 0.6, 0.0, 1.0);
    if (t.status == 3) p.y *= mix(1.0, 0.05, k);
  }
  vY = p.y;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const TILE_FRAG = /* glsl */ `
${TRUTH_CHUNK}
// GLSL3 ShaderMaterial: three does not declare the output; the tonemapping/colorspace chunks write gl_FragColor.
layout(location = 0) out highp vec4 fragOut;
#define gl_FragColor fragOut
uniform vec3 uKeyDir, uKeyColor, uHemiSky, uHemiGround;
in vec2 vUvC;
in float vSide, vSlot, vKind, vSeed, vStreet, vY, vSage;
in vec3 vDye;
in vec2 vAxial;
in vec3 vNormalW;

vec3 kindColour(float kind, float side) {
  vec3 c = kind < 0.5 ? vec3(0.659, 0.592, 0.478)        // ground plate: warm limestone #a8977a (DESIGN §2b)
         : kind < 1.5 ? vec3(0.169, 0.129, 0.090)        // house cell: --plinth
         : kind < 3.5 ? vec3(0.290, 0.220, 0.149)        // the Clearinghouse's plinth: --plinth-lit
         : vec3(0.290, 0.310, 0.341);                    // dressing: slate #4a4f57 (data yards, foundries' yards)
  return lin(side > 0.5 ? c * 0.72 : c);
}
float stripe(vec2 p, float a) { float d = fract(dot(p, vec2(cos(a), sin(a)))); return 1.0 - smoothstep(0.08, 0.16, abs(d - 0.5)); }
float hatch(float phi, vec2 uvTile, float seed) {
  float fog = 1.0 - phi;
  vec2 p = uvTile * (HEX_FLAT * uPxPerUnit) / (6.0 * uDpr) + seed * 7.0;
  return clamp(stripe(p, 0.0) * smoothstep(0.02, 0.12, fog) + stripe(p, 0.785) * smoothstep(0.30, 0.40, fog)
             + stripe(p, 1.571) * smoothstep(0.55, 0.65, fog) + stripe(p, 2.356) * smoothstep(0.80, 0.90, fog), 0.0, 1.0);
}
float sweepFront(Truth t, vec2 uvC) {
  float age = uTime - t.syncT, dur = mix(0.6, 0.15, uReducedMotion);
  float x = dot(uvC, normalize(vec2(1.0, 0.6)));
  return (age / dur - 0.5) * 1.6 - x;
}
float visiblePhi(Truth t, vec2 uvC) {
  float synced = step(0.0, sweepFront(t, uvC));
  return (uTime - t.syncT) < 0.8 ? mix(t.phiPrev, t.phi, synced) : mix(t.phiPrev, t.phi, blendT());
}
vec3 applyFog(vec3 col, float phi, vec2 uv, float seed) {
  float fog = 1.0 - phi;
  float smoke = 1.0 - uReducedMotion;
  col = mix(col, lin(uFogTint) * dot(col, vec3(0.299, 0.587, 0.114)) * 1.6, 0.7 * fog);
  float grain = hash12(gl_FragCoord.xy + mix(uTime * 60.0, 0.0, uReducedMotion)) - 0.5;
  col += smoke * grain * fog * fog * 0.35;
  col = mix(col, lin(vec3(0.055, 0.039, 0.024)), hatch(phi, uv, seed) * uHatchWeight);
  return col;
}
vec3 sweepLight(vec3 col, Truth t, vec2 uvC) {
  float front = sweepFront(t, uvC), age = uTime - t.syncT;
  float band = (age < 0.8) ? 1.0 - smoothstep(0.0, 0.12, abs(front)) : 0.0;
  return col + vec3(0.16, 0.65, 0.72) * band * 1.4;
}
float purseArc(Truth t, vec2 uvC) {
  float ang = atan(uvC.x, uvC.y) / 6.2831853 + 0.5;
  float r = length(uvC);
  float rim = smoothstep(0.36, 0.38, r) * (1.0 - smoothstep(0.41, 0.43, r));
  return rim * step(ang, mix(t.purseP, t.purse, blendT()));
}
float hexDist(vec2 a) { return (abs(a.x) + abs(a.y) + abs(a.x + a.y)) * 0.5; }

void main() {
  vec3 col = kindColour(vKind, vSide);
  bool cap = vSide < 0.5;
  float r = length(vUvC);
  float rim = smoothstep(0.44, 0.47, r);
  if (vSlot >= 0.0) {
    Truth t = fetchTruth(vSlot);
    float phi = visiblePhi(t, vUvC);
    if (cap) {
      col = mix(col, lin(vDye), rim);                                                      // the rim: the street's dye (§2b.3)
      col = mix(col, lin(vec3(0.725, 0.525, 0.149)), purseArc(t, vUvC));                     // the purse arc: --gold-2
      if (t.purse < 0.15) col = mix(col, lin(vec3(0.79, 0.32, 0.25)), purseArc(t, vUvC));    // ember below 15 %
      float cool = exp(-3.0 * max(0.0, uTime - uTickT) / uTickSeconds);
      float h = t.status == 1 ? 0.0 : t.heat * cool;                                     // a waiting house is cold
      col += lin(vec3(0.79, 0.32, 0.25)) * h * (1.0 - smoothstep(0.06, 0.14, r)) * 0.9;     // the chimney mouth
      float breathe = 0.7 + 0.3 * sin(uTime * 2.6) * (1.0 - uReducedMotion);
      if (t.status == 1) col = mix(col, lin(vec3(0.95, 0.80, 0.48)), rim * 0.5 * breathe);  // waiting: gold-light, the hand
      if (t.status == 2) col = mix(col, lin(vec3(0.79, 0.32, 0.25)), rim * 0.6);             // halted: ember rim
      if (vStreet > 0.5) col = mix(col, lin(vec3(0.79, 0.32, 0.25)), rim * 0.35);      // a halted house on this street
      float sage = uTime - vSage;
      if (sage >= 0.0 && sage < 0.3) col = mix(col, lin(vec3(0.416, 0.604, 0.431)), rim); // a settle ticks the rim --sage
    }
    col = applyFog(col, phi, vUvC, vSeed);
    if (t.status == 3) col = mix(col, lin(vec3(0.243, 0.227, 0.204)), 0.6);                  // packed: --resin
    if (t.status == 4) col *= 0.25;                                                     // partitioned
    col = sweepLight(col, t, vUvC);
  }
  // Pulses from the ring: NETTED's gold ring leaving the dome at 40 ms per hex; SLASHED's flash and scorch.
  float d = hexDist(vAxial);
  for (int i = 0; i < 16; i++) {
    vec4 P = uPulses[i], D = uPulseData[i];
    int kind = int(P.x + 0.5);
    float age = uTime - P.y;
    if (kind == 1 && cap && age > 0.4) {
      float front = (age - 0.4) / 0.04;
      float width = 0.25 + 0.5 * clamp(D.y / max(D.x, 1e-3), 0.0, 1.0);
      float on = 1.0 - smoothstep(0.0, width, abs(d - front));
      col = mix(col, lin(vec3(0.831, 0.655, 0.333)), on * 0.75 * step(front, D.w + 3.0));
    }
    if (kind == 4 && cap && distance(vAxial, P.zw) < 0.1) {
      float flash = age < 0.4 ? 1.0 - age / 0.4 : 0.0;
      float scorch = 0.4 * (1.0 - clamp(age / (max(D.y, 1.0) * uTickSeconds), 0.0, 1.0));
      col = mix(col, lin(vec3(0.79, 0.32, 0.25)), max(flash * rim, 0.0));
      col = mix(col, lin(vec3(0.055, 0.039, 0.024)), scorch * (1.0 - smoothstep(0.2, 0.45, r)));
    }
  }
  // Light: hemisphere plus the preset's key, flat Lambert (the same warm key as the room).
  vec3 n = normalize(vNormalW);
  vec3 light = mix(uHemiGround, uHemiSky, 0.5 + 0.5 * n.y) + uKeyColor * max(dot(n, normalize(uKeyDir)), 0.0);
  gl_FragColor = vec4(col * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
