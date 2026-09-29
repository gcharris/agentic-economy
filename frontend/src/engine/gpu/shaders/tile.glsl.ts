// The plate shaders (ARCHITECTURE §6.3 as amended by §7.3), GLSL ES 3.00 through ShaderMaterial({ glslVersion: GLSL3 }).
// Kept as TypeScript strings so vite and vitest load them the same way.
//
// The edge is the epistemics (DESIGN §2c.2): the vertex shader displaces a plate's rim by fog = 1 − Φ,
//   r' = r · (1 + fog · g · (0.05·n₁(3θ) + 0.03·n₂(9θ) + 0.015·n₃(27θ))),
// the octaves fading in at fog 0.02, 0.30, 0.60, so a crisp plate is a circle and a foggy one a coastline; the
// STATE_SYNC front gates it (Φ behind the front is the new Φ), so a sync visibly smooths the rim. g = uEdgeGain
// (default 4, documented in TileMesh.ts): at §7.3's literal amplitudes a house at Φ 0.9 moves its rim by 3 cm.
// Hatching and grain stay as the secondary cue (and the colour-vision-safe one); the desaturation stays.

export const TRUTH_CHUNK = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D uTruth, uTruthPrev, uTimes;
uniform float uTime, uTickT, uTickSeconds, uAltitude, uReducedMotion, uPxPerUnit, uDpr, uHatchWeight, uBurnRef, uEdgeGain;
uniform vec3 uFogTint;
uniform vec4 uPulses[16];
uniform vec4 uPulseData[16];
#define HOUSE_D 13.0
struct Truth { float phi, phiPrev, purse, purseP, heat, variance, syncT, packT, haltT; int status; bool held; };
Truth fetchTruth(float slot) {
  int s = int(slot + 0.5); // rounded: an interpolated 13.0 can arrive as 12.99999
  ivec2 tc = ivec2(s & 255, s >> 8);
  vec4 a = texelFetch(uTruth, tc, 0), p = texelFetch(uTruthPrev, tc, 0), t = texelFetch(uTimes, tc, 0);
  Truth r; r.phi = a.r; r.phiPrev = p.r; r.purse = a.g; r.purseP = p.g; r.heat = a.b;
  int code = int(a.a + 0.5); r.held = code >= 8; r.status = code & 7;
  r.syncT = t.r; r.packT = t.g; r.haltT = t.b; r.variance = t.a; return r;
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float blendT() { return smoothstep(0.0, 1.0, clamp((uTime - uTickT) / uTickSeconds, 0.0, 1.0)); }
float sweepFront(Truth t, vec2 uvC) {
  float age = uTime - t.syncT, dur = mix(0.6, 0.15, uReducedMotion);
  float x = dot(uvC, normalize(vec2(1.0, 0.6)));
  return (age / dur - 0.5) * 1.6 - x;
}
float visiblePhi(Truth t, vec2 uvC) {
  float synced = step(0.0, sweepFront(t, uvC));
  return (uTime - t.syncT) < 0.8 ? mix(t.phiPrev, t.phi, synced) : mix(t.phiPrev, t.phi, blendT());
}
`;

export const TILE_VERT = /* glsl */ `
${TRUTH_CHUNK}
// Packed (WebGL allows 16 attribute slots): vtx = (angle, rho, y, part: 0 cap, 1 bevel, 2 wall);
// iA = (centre x, centre z, radius, height); iB = (slot, kind, seed, street halted); iC = (dye rgb, sage time).
in vec4 vtx;
in vec4 iA, iB, iC, iD; // iD = (base: the parent's top, speck index, –, –): terraces, DESIGN §2c.1
// Per-instance values are flat: interpolating a constant across a long fan triangle is not exact on every GPU, and a
// slot that arrives as 12.99999 reads the wrong node's texel (it drew wedges across the city plate).
out vec2 vUvC, vWorld;
flat out vec2 vCenter;
out float vSide, vRho;
flat out float vSlot, vKind, vSeed, vStreet, vSage;
flat out vec3 vDye;
out vec3 vNormalW;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
/** Periodic noise round the rim: sampled on a circle, so θ = 0 and 2π agree (no seam). */
float rimNoise(float a, float cycles, float seed) { return vnoise(vec2(cos(a), sin(a)) * cycles * 0.16 + seed * 97.0) * 2.0 - 1.0; }

void main() {
  float ang = vtx.x, rho = vtx.y, side = vtx.w > 0.5 ? 1.0 : 0.0;
  vec2 aCenter = iA.xy; float aRadius = iA.z, aTop = iA.w, aBase = iD.x, aIndex = iD.y;
  float aSlot = iB.x, aKind = iB.y, aSeed = iB.z;
  vec3 position = vec3(0.0, vtx.z, 0.0);
  vec3 normal = vtx.w < 0.5 ? vec3(0.0, 1.0, 0.0) : vtx.w < 1.5 ? normalize(vec3(cos(ang) * 0.2, 0.1, sin(ang) * 0.2)) : vec3(cos(ang), 0.0, sin(ang));
  vSide = side; vRho = rho; vSlot = aSlot; vKind = aKind; vSeed = aSeed; vStreet = iB.w; vSage = iC.w; vDye = iC.rgb; vCenter = aCenter;
  vec2 unit = vec2(cos(ang), sin(ang)) * rho;
  float fog = 0.0, fold = 0.0; bool packed = false;
  if (aSlot >= 0.0) {
    Truth t = fetchTruth(aSlot);
    fog = clamp(1.0 - visiblePhi(t, unit * 0.5), 0.0, 1.0);
    packed = t.status == 3 || iB.w >= 1.5; // a sealed street is one smooth plate too (DESIGN §2c.2)
    fold = packed ? clamp((uTime - t.packT) / 0.6, 0.0, 1.0) : 0.0; // PACKED folds a bulb into its parent over 600 ms
  }
#ifdef SPECK
  // Detached specks off a foggy rim (fog > 0.5): a tiny instance ring round each plate.
  float k = smoothstep(0.5, 0.65, fog) * (packed ? 0.0 : 1.0);
  float h = hash12(vec2(aSeed * 91.0, aIndex));
  float a0 = aSeed * 6.2831 + aIndex * 1.047 + h * 0.6;
  float dist = aRadius * (1.1 + 0.18 * h);
  float size = aRadius * (0.03 + 0.04 * h) * k;
  vec2 u = vec2(cos(ang), sin(ang)) * rho;
  vec3 p = vec3(u.x * size + cos(a0) * dist, aBase + position.y * (aTop - aBase) * 0.6, u.y * size + sin(a0) * dist);
  vUvC = u * 0.5;
#else
  float disp = 0.05 * rimNoise(ang, 3.0, aSeed) * smoothstep(0.02, 0.12, fog)
             + 0.03 * rimNoise(ang, 9.0, aSeed + 0.37) * smoothstep(0.30, 0.40, fog)
             + 0.015 * rimNoise(ang, 27.0, aSeed + 0.71) * smoothstep(0.60, 0.70, fog);
  float rr = rho >= 0.9 && !packed ? rho * (1.0 + fog * uEdgeGain * disp) : rho;       // a packed plate is one smooth circle
  rr *= 1.0 - 0.97 * fold;
  vec3 p = vec3(cos(ang) * rr * aRadius, aBase + position.y * (aTop - aBase) * (1.0 - fold), sin(ang) * rr * aRadius);
  vUvC = unit * 0.5;
#endif
  vec3 w = vec3(aCenter.x + p.x, p.y, aCenter.y + p.z);
  vWorld = w.xz;
  vNormalW = normalize(normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

export const TILE_FRAG = /* glsl */ `
${TRUTH_CHUNK}
layout(location = 0) out highp vec4 fragOut;
#define gl_FragColor fragOut
uniform vec3 uKeyDir, uKeyColor, uHemiSky, uHemiGround;
in vec2 vUvC, vWorld;
flat in vec2 vCenter;
in float vSide, vRho;
flat in float vSlot, vKind, vSeed, vStreet, vSage;
flat in vec3 vDye;
in vec3 vNormalW;

vec3 kindColour(float kind) {
  return kind < 1.5 ? vec3(0.169, 0.129, 0.090)        // 1 house plate: --plinth
       : kind < 2.5 ? vec3(0.612, 0.541, 0.427)        // 2 street plate: its commons are tinted in main()
       : kind < 3.5 ? vec3(0.659, 0.592, 0.478)        // 3 city plate: warm limestone #a8977a (DESIGN §2b)
       : kind < 4.5 ? vec3(0.165, 0.129, 0.094)        // 4 country: a plateau of cut card #2a2118 (DESIGN §8)
       : kind < 5.5 ? vec3(0.290, 0.310, 0.341)        // 5 data yard: slate #4a4f57
       : vec3(0.490, 0.290, 0.204);                    // 6 foundry: fired clay --roof
}
// Antialiased with the pattern's own screen derivative: a 6 px hatch otherwise beats against the pixel grid into moiré.
float stripe(vec2 p, float a) {
  float x = dot(p, vec2(cos(a), sin(a)));
  float w = max(fwidth(x), 1e-4);
  float d = abs(fract(x) - 0.5);
  float line = 1.0 - smoothstep(0.1, 0.1 + 1.5 * w, d);
  return line * clamp(0.5 / w, 0.0, 1.0);        // fade out where the stripes are finer than two pixels
}
float hatch(float phi, vec2 uvTile, float seed) {
  float fog = 1.0 - phi;
  // World-anchored (metres × px per metre ÷ 6 px): a 6 px pitch on every plate at every altitude, and no kinks where
  // the rim displacement stretches the cap's fan (plate-local uv would bend at each triangle seam).
  vec2 p = uvTile * uPxPerUnit / (6.0 * uDpr) + seed * 7.0;
  return clamp(stripe(p, 0.0) * smoothstep(0.02, 0.12, fog) + stripe(p, 0.785) * smoothstep(0.30, 0.40, fog)
             + stripe(p, 1.571) * smoothstep(0.55, 0.65, fog) + stripe(p, 2.356) * smoothstep(0.80, 0.90, fog), 0.0, 1.0);
}
vec3 applyFog(vec3 col, float phi, vec2 uv, float seed) {
  float fog = 1.0 - phi;
  float smoke = 1.0 - uReducedMotion;
  col = mix(col, lin(uFogTint) * dot(col, vec3(0.299, 0.587, 0.114)) * 1.6, 0.7 * fog);
  float grain = hash12(gl_FragCoord.xy + mix(uTime * 60.0, 0.0, uReducedMotion)) - 0.5;
  col += smoke * grain * fog * fog * 0.2;
  col = mix(col, lin(vec3(0.055, 0.039, 0.024)), hatch(phi, vWorld, seed) * uHatchWeight);
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
  float rim = smoothstep(0.34, 0.36, r) * (1.0 - smoothstep(0.40, 0.42, r));
  return rim * step(ang, mix(t.purseP, t.purse, blendT()));
}

void main() {
  vec3 col = lin(kindColour(vKind));
  bool bevel = vSide > 0.5;
  // The rim: a house or street plate wears its street's dye (§2b.3); the city plate an oak edge; dressing its own.
  if (bevel) col = vKind < 2.5 ? lin(vDye) : vKind < 3.5 ? lin(vec3(0.353, 0.259, 0.184)) : col * 0.72;
  // A plate carries its own life (§2c.1.3): a street's commons is turf tinted with its dye; the city plate is paved in
  // rings round the dome.
  bool sealed = vStreet >= 1.5;
  if (!bevel && vKind > 1.5 && vKind < 2.5 && !sealed) {
    vec3 turf = mix(lin(vec3(0.42, 0.47, 0.27)), lin(vDye), 0.35);
    float mottle = hash12(floor(vWorld * 0.8)) * 0.08;
    col = turf * (0.92 + mottle);
  }
  if (vKind > 3.5 && vKind < 4.5) {             // the country: risers #1e1710, contour lines #3a2f24 round its centre
    if (bevel) col = lin(vec3(0.118, 0.090, 0.063));
    else {
      float c = length(vWorld - vCenter) / 14.0;
      float w = fwidth(c);
      col = mix(col, lin(vec3(0.227, 0.184, 0.141)), 1.0 - smoothstep(0.0, 1.5 * w + 0.02, abs(fract(c) - 0.5) - 0.45));
    }
  }
  if (!bevel && vKind > 2.5 && vKind < 3.5) {
    float d = length(vWorld - vCenter);
    float band = step(0.5, fract(d / 1.6)) * (1.0 - smoothstep(10.0, 16.0, d));
    col = mix(col, col * 0.86, band);
    col = mix(col, lin(vec3(0.353, 0.259, 0.184)), (1.0 - smoothstep(0.05, 0.25, abs(d - 16.5))) * 0.6); // a brass-oak edge to the paving
  }
  if (vSlot >= 0.0) {
    Truth t = fetchTruth(vSlot);
    float phi = visiblePhi(t, vUvC);
    if (!bevel && vKind < 1.5) {
      col = mix(col, lin(vec3(0.725, 0.525, 0.149)), purseArc(t, vUvC));
      if (t.purse < 0.15) col = mix(col, lin(vec3(0.79, 0.32, 0.25)), purseArc(t, vUvC));
      float cool = exp(-3.0 * max(0.0, uTime - uTickT) / uTickSeconds);
      float h = t.status == 1 ? 0.0 : t.heat * cool;
      col += lin(vec3(0.79, 0.32, 0.25)) * h * (1.0 - smoothstep(0.04, 0.1, length(vUvC))) * 0.9;
    }
    if (bevel) {
      float breathe = 0.7 + 0.3 * sin(uTime * 2.6) * (1.0 - uReducedMotion);
      if (t.status == 1) col = mix(col, lin(vec3(0.95, 0.80, 0.48)), 0.6 * breathe);    // waiting: gold-light, the hand
      if (t.status == 2) col = mix(col, lin(vec3(0.79, 0.32, 0.25)), 0.7);              // halted: ember rim
      if (mod(vStreet, 2.0) > 0.5) col = mix(col, lin(vec3(0.79, 0.32, 0.25)), 0.35);             // a halted house on this street
      float sage = uTime - vSage;
      if (sage >= 0.0 && sage < 0.3) col = lin(vec3(0.416, 0.604, 0.431));              // a settle ticks the rim --sage
    }
    col = applyFog(col, phi, vUvC, vSeed);
    if (t.status == 3) col = mix(col, lin(vec3(0.243, 0.227, 0.204)), 0.6);             // packed: --resin
    if (sealed) {                                  // a sealed street (DESIGN §10): cast resin, nothing moving inside,
      float flick = (hash12(floor(vWorld * 0.35) + floor(uTime * (0.5 + 4.0 * t.variance))) - 0.5) * t.variance * (1.0 - uReducedMotion);
      col = lin(vec3(0.243, 0.227, 0.204)) * (bevel ? 0.8 : 1.0 + flick * 1.5);          // shimmering at 0.5 + 4·variance
    }
    if (t.status == 4) col *= 0.25;                                                     // partitioned
    col = sweepLight(col, t, vUvC);
  }
  // Pulses: NETTED's gold ring leaving the dome at 40 ms per house diameter; SLASHED's flash and scorch.
  for (int i = 0; i < 16; i++) {
    vec4 P = uPulses[i], D = uPulseData[i];
    int kind = int(P.x + 0.5);
    float age = uTime - P.y;
    if (kind == 1 && !bevel && age > 0.4) {
      float d = length(vWorld - P.zw) / HOUSE_D;
      float front = (age - 0.4) / 0.04;
      float width = 0.2 + 0.4 * clamp(D.y / max(D.x, 1e-3), 0.0, 1.0);
      float on = 1.0 - smoothstep(0.0, width, abs(d - front));
      col = mix(col, lin(vec3(0.831, 0.655, 0.333)), on * 0.75 * step(front, D.w + 2.0));
    }
    if (kind == 4 && distance(vCenter, P.zw) < 0.5) {
      float flash = age < 0.4 ? 1.0 - age / 0.4 : 0.0;
      float scorch = 0.4 * (1.0 - clamp(age / (max(D.y, 1.0) * uTickSeconds), 0.0, 1.0));
      if (bevel) col = mix(col, lin(vec3(0.79, 0.32, 0.25)), flash);
      else col = mix(col, lin(vec3(0.055, 0.039, 0.024)), scorch * (1.0 - smoothstep(0.2, 0.45, length(vUvC))));
    }
  }
  vec3 n = normalize(vNormalW);
  vec3 light = mix(uHemiGround, uHemiSky, 0.5 + 0.5 * n.y) + uKeyColor * max(dot(n, normalize(uKeyDir)), 0.0);
  gl_FragColor = vec4(col * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
