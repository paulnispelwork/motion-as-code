// The 3D world behind the film: a swarm of glowing particles is the hero
// object. It pours out of the headline's full stop, is flown through, bursts
// and re-forms into each outcome's shape. Behind it: nebula, dust and a glow.
// Every uniform is a pure function of t, plus a little pointer parallax.

import { B, BEAT, OUTCOME_BEATS, OUTCOME_COUNT, OUTCOME_FROM } from "@/lib/film/timeline";
import { range, smooth, track, window4 } from "@/lib/film/motion";

const QUAD_VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const PALETTE = `
const vec3 VIOLET = vec3(0.42, 0.33, 1.0);
const vec3 ROSE = vec3(1.0, 0.25, 0.48);
const vec3 EMBER = vec3(1.0, 0.52, 0.26);
const vec3 BG = vec3(0.027, 0.031, 0.051);
mat2 rot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
`;

// Background: nebula, dust planes, the swarm's glow and the inside-the-orb swirl.
const BACKGROUND_FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uClock;
uniform vec3 uCam;
uniform float uFov;
uniform vec2 uShift;
uniform float uR;
uniform float uSpin;
uniform float uAtmos;
uniform float uDust;
uniform float uInside;
uniform float uGlow;
uniform float uScatter;
${PALETTE}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
vec3 tone(vec3 l) { return 1.0 - exp(-l * 1.35); }

void main() {
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;
  vec3 ro = uCam;
  vec3 fw = normalize(-uCam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec2 uv = ndc - uShift;
  float focal = 1.0 / tan(uFov * 0.5);
  vec3 rd = normalize(uv.x * aspect * rt + uv.y * up + fw * focal);
  float pixel = 2.0 / (focal * uRes.y);

  // Nebula: follows ray direction, so it parallaxes as the camera orbits.
  vec2 sp = rd.xy / (1.0 + abs(rd.z)) + rd.z * 0.3;
  float nb = fbm(sp * 2.2 + vec2(uClock * 0.015, 0.0));
  vec3 neb = mix(VIOLET * 0.6, ROSE * 0.55, fbm(sp * 3.1 + 7.0));
  neb = mix(neb, EMBER * 0.5, smoothstep(0.6, 0.9, fbm(sp * 1.7 - 3.0)));
  vec3 light = neb * pow(nb, 2.2) * uAtmos * 1.2;

  // The swarm's glow, from each ray's closest approach to its centre.
  if (uR > 0.0005) {
    float tc = dot(-ro, rd);
    float miss = length(ro + rd * max(tc, 0.0)) / uR;
    float shown = 1.0 - smoothstep(1.2, 2.6, uScatter);
    light += mix(ROSE, VIOLET, 0.55) * exp(-max(miss - 0.9, 0.0) * 2.0) * 0.07 * uGlow * shown;
  }

  // Dust on world-space planes: real parallax when the camera moves.
  float dust = 0.0;
  for (int k = 0; k < 10; k++) {
    float z = -9.0 + float(k) * 2.0;
    float th = (z - ro.z) / rd.z;
    if (th > 0.15) {
      vec3 p = ro + rd * th;
      vec2 c = p.xy * 1.3 + float(k) * 3.7;
      vec2 id = floor(c);
      float h = hash(id + float(k) * 7.1);
      if (h > 0.8) {
        vec2 o = vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5;
        float d = length(fract(c) - 0.5 - o * 0.6);
        float twinkle = 0.55 + 0.45 * sin(uClock * 1.7 + h * 40.0);
        float size = max(0.045, th * pixel * 1.3 * 1.3);
        dust += smoothstep(size, 0.0, d) * (0.045 / size) * twinkle * smoothstep(0.8, 2.5, th) / (1.0 + th * 0.12);
      }
    }
  }
  light += mix(vec3(1.0, 0.85, 0.8), VIOLET, 0.35) * dust * uDust * 0.9;

  // Inside the orb: the swirl fills the frame, turning around the swarm's centre.
  if (uInside > 0.001) {
    vec2 d = (gl_FragCoord.xy - (0.5 + 0.5 * uShift) * uRes) / uRes.y * 0.8;
    float rr = length(d);
    float a = atan(d.y, d.x) + uSpin + 1.4 / (rr + 0.3);
    vec2 q = vec2(cos(a), sin(a)) * rr;
    float n = fbm(q * 2.4 + vec2(uClock * 0.06, -uClock * 0.04));
    vec3 c = mix(VIOLET, ROSE, smoothstep(0.25, 0.7, n));
    c = mix(c, EMBER, smoothstep(0.6, 0.9, n) * (1.0 - smoothstep(0.1, 0.5, rr)) * 0.6);
    light += c * (0.3 + 0.9 * n) * uInside;
  }

  vec3 col = BG + tone(light);
  float vig = length(ndc * vec2(0.85, 1.0));
  col *= 1.0 - 0.32 * vig * vig;
  col += (hash(gl_FragCoord.xy + fract(uClock) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

// The swarm. Each particle has a home on every shape and a normal there, so a
// key light can glint across the swarm like light on a polished surface.
const SWARM_VERT = `
attribute float aI;
uniform vec2 uRes;
uniform float uClock;
uniform vec3 uCam;
uniform float uFov;
uniform vec2 uShift;
uniform float uR;
uniform float uRpx;
uniform vec2 uRot;
uniform float uSpin;
uniform float uShape;
uniform float uMorph;
uniform float uRing;
uniform float uGlow;
uniform float uScatter;
uniform float uAssemble;
uniform float uN;
uniform float uPx;
varying vec3 vCol;
varying float vA;
${PALETTE}
float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// Home position and normal of particle i on shape s (0 sphere, 1 torus, 2 rounded cube, 3 sphere).
void home(float s, float i, vec3 d, out vec3 p, out vec3 n) {
  if (s > 0.5 && s < 1.5) {
    float u = 6.2831853 * fract(i * 0.6180339887);
    float v = 6.2831853 * fract(i * 0.7548776662);
    float cu = cos(u); float su = sin(u); float cv = cos(v); float sv = sin(v);
    p = vec3((0.78 + 0.36 * cv) * cu, 0.36 * sv, (0.78 + 0.36 * cv) * su);
    n = vec3(cv * cu, sv, cv * su);
  } else if (s > 1.5 && s < 2.5) {
    vec3 a = abs(d);
    vec3 c = d / max(a.x, max(a.y, a.z));
    p = mix(c * 0.74, d * 0.98, 0.18);
    n = normalize(sign(c) * pow(abs(c), vec3(8.0)));
  } else {
    p = d;
    n = d;
  }
}

void main() {
  float i = aI;
  float h = h1(i); float h2 = h1(i + 71.3); float h3 = h1(i + 13.7);

  // Fibonacci sphere: an even spread of directions.
  float y = 1.0 - (i / (uN - 1.0)) * 2.0;
  float rr = sqrt(max(0.0, 1.0 - y * y));
  float phi = i * 2.399963;
  vec3 d = vec3(cos(phi) * rr, y, sin(phi) * rr);

  // Morph with a per-particle stagger, so the swarm streams into the next shape.
  float m = smoothstep(h * 0.5, h * 0.5 + 0.5, uMorph);
  vec3 pa; vec3 na; vec3 pb; vec3 nb;
  home(uShape, i, d, pa, na);
  home(uShape + 1.0, i, d, pb, nb);
  vec3 p = mix(pa, pb, m);
  vec3 n = normalize(mix(na, nb, m));

  // Flowing bands across the surface.
  float flow = sin(d.y * 7.0 + uClock * 0.9 + sin(d.x * 3.0 + uClock * 0.4) * 1.5);
  p *= 1.0 + 0.014 * flow + 0.02 * (h - 0.5);

  // Pour out of the centre, staggered.
  p *= smoothstep(h * 0.55, h * 0.55 + 0.45, uAssemble);

  // Burst: particles fly out along their own direction and swirl.
  vec3 dir = normalize(d + vec3(h - 0.5, h2 - 0.5, h3 - 0.5) * 0.8);
  p += dir * uScatter * (0.4 + 2.4 * h * h);
  p.xz = rot(uScatter * 0.8 * (h2 - 0.5)) * p.xz;

  // A disk of particles orbiting the swarm: its ring.
  bool disk = h3 > 0.86;
  float diskA = 1.0;
  if (disk) {
    float rad = 1.45 + h * 0.5;
    float ang = phi + uClock * (0.15 + 0.3 * (1.0 - h)) + uSpin * 0.2;
    p = vec3(cos(ang) * rad, (h2 - 0.5) * 0.05 * rad, sin(ang) * rad);
    p.yz = rot(0.42) * p.yz;
    p.xy = rot(-0.3) * p.xy;
    p += dir * uScatter * (0.6 + 2.0 * h);
    n = normalize(vec3(p.x, 0.0, p.z));
    diskA = uRing;
  } else {
    // Object rotation (the inverse of the object-space transform).
    p.yz = rot(-uRot.y) * p.yz; n.yz = rot(-uRot.y) * n.yz;
    p.xz = rot(-uRot.x) * p.xz; n.xz = rot(-uRot.x) * n.xz;
  }

  vec3 world = p * uR;

  // Same camera and lens shift as the background pass.
  vec3 fw = normalize(-uCam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 c = world - uCam;
  float z = dot(c, fw);
  float focal = 1.0 / tan(uFov * 0.5);
  float aspect = uRes.x / uRes.y;
  if (z < 0.02 || diskA < 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vA = 0.0;
    vCol = vec3(0.0);
    return;
  }
  vec2 ndc = vec2(dot(c, rt) * focal / (z * aspect), dot(c, up) * focal / z) + uShift;
  gl_Position = vec4(ndc, 0.0, 1.0);

  // Size scales with how big the swarm reads on screen, and with nearness.
  float dist = length(uCam);
  float scale = clamp(uRpx / 170.0, 0.8, 1.6);
  gl_PointSize = min((1.4 + 2.4 * h * h) * uPx * scale * (dist / z), 64.0);

  // Shiny lighting: a warm key light glints, the rim burns, the back side dims.
  vec3 v = normalize(uCam - world);
  vec3 key = normalize(vec3(0.6, 0.75, 0.55));
  vec3 halfv = normalize(key + v);
  float ndv = dot(n, v);
  float front = smoothstep(-0.35, 0.35, ndv);
  float spec = pow(max(dot(n, halfv), 0.0), 36.0);
  float sparkle = step(0.82, h1(i + floor(uClock * 9.0 + h * 9.0)));
  float rim = pow(1.0 - abs(ndv), 3.0);
  float diff = max(dot(n, key), 0.0);

  vec3 col = mix(VIOLET, ROSE, smoothstep(-0.6, 0.6, d.y + flow * 0.25));
  col = mix(col, EMBER, smoothstep(0.72, 1.0, h2) * 0.85);
  col *= 0.6 + 0.65 * diff + 0.8 * rim;
  col += vec3(1.0, 0.9, 0.82) * spec * (2.0 + 3.0 * sparkle) * front;
  col += mix(ROSE, EMBER, 0.5) * rim * 0.35;

  // Dense when small, so a tiny swarm is a clean dot instead of a white blob.
  float density = clamp(pow(uRpx / 160.0, 1.3), 0.05, 1.0);
  float fade = 1.0 - smoothstep(1.4, 2.8, uScatter);
  vCol = col * uGlow;
  vA = (0.25 + 0.75 * front) * density * fade * diskA * (disk ? 0.8 : 1.0);
}
`;

const SWARM_FRAG = `
precision mediump float;
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vCol * a * a * vA * 0.6, 1.0);
}
`;

export type WorldState = {
  cam: [number, number, number];
  fov: number;
  shift: [number, number];
  r: number;
  rpx: number;
  rot: [number, number];
  spin: number;
  shape: number;
  morph: number;
  ring: number;
  atmos: number;
  dust: number;
  inside: number;
  glow: number;
  scatter: number;
  assemble: number;
};

export type World = {
  resize: (w: number, h: number) => void;
  draw: (state: WorldState, clock: number) => void;
  dispose: () => void;
};

// Start sharp within a pixel budget, then let the measured frame time move the
// resolution: down when a device struggles, up when it has headroom.
const MAX_PIXELS = 3_000_000;
const MIN_QUALITY = 0.35;
const SLOW_MS = 24;
const FAST_MS = 18;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
  }
  return shader;
}

function link(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create program");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
  }
  return program;
}

function uniforms(gl: WebGLRenderingContext, program: WebGLProgram, names: string[]) {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
}

export function createWorld(canvas: HTMLCanvasElement, adaptive = true): World | null {
  try {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) return null;

    const background = link(gl, QUAD_VERT, BACKGROUND_FRAG);
    const swarm = link(gl, SWARM_VERT, SWARM_FRAG);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const quadPos = gl.getAttribLocation(background, "aPos");

    const count = window.innerWidth < 700 ? 24_000 : 56_000;
    const ids = new Float32Array(count);
    for (let i = 0; i < count; i++) ids[i] = i;
    const particles = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particles);
    gl.bufferData(gl.ARRAY_BUFFER, ids, gl.STATIC_DRAW);
    const particleId = gl.getAttribLocation(swarm, "aI");

    const bg = uniforms(gl, background, ["uRes", "uClock", "uCam", "uFov", "uShift", "uR", "uSpin", "uAtmos", "uDust", "uInside", "uGlow", "uScatter"]);
    const sw = uniforms(gl, swarm, ["uRes", "uClock", "uCam", "uFov", "uShift", "uR", "uRpx", "uRot", "uSpin", "uShape", "uMorph", "uRing", "uGlow", "uScatter", "uAssemble", "uN", "uPx"]);

    gl.useProgram(swarm);
    gl.uniform1f(sw.uN, count);
    gl.blendFunc(gl.ONE, gl.ONE);

    let width = 1;
    let height = 1;
    let quality = 1;
    let last = 0;
    let frameMs = 16.7;
    let frames = 0;

    const apply = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const budget = Math.sqrt(MAX_PIXELS / (width * height * dpr * dpr));
      const scale = dpr * Math.min(quality, budget);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(background);
      gl.uniform2f(bg.uRes, canvas.width, canvas.height);
      gl.useProgram(swarm);
      gl.uniform2f(sw.uRes, canvas.width, canvas.height);
      gl.uniform1f(sw.uPx, scale);
    };

    const adapt = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (dt <= 0 || dt > 100) return; // tab switches and first frames
      frameMs += (dt - frameMs) * 0.05;
      if (++frames < 45) return;
      frames = 0;
      if (frameMs > SLOW_MS && quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality * 0.85);
        apply();
      } else if (frameMs < FAST_MS && quality < 1) {
        quality = Math.min(1, quality * 1.08);
        apply();
      }
    };

    return {
      resize(w, h) {
        width = w;
        height = h;
        apply();
      },
      draw(s, clock) {
        if (adaptive) adapt();

        gl.disable(gl.BLEND);
        gl.useProgram(background);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(quadPos);
        gl.vertexAttribPointer(quadPos, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(bg.uClock, clock);
        gl.uniform3f(bg.uCam, ...s.cam);
        gl.uniform1f(bg.uFov, s.fov);
        gl.uniform2f(bg.uShift, ...s.shift);
        gl.uniform1f(bg.uR, s.r);
        gl.uniform1f(bg.uSpin, s.spin);
        gl.uniform1f(bg.uAtmos, s.atmos);
        gl.uniform1f(bg.uDust, s.dust);
        gl.uniform1f(bg.uInside, s.inside);
        gl.uniform1f(bg.uGlow, s.glow);
        gl.uniform1f(bg.uScatter, s.scatter);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(quadPos);

        if (s.r <= 0.0005) return;
        gl.enable(gl.BLEND);
        gl.useProgram(swarm);
        gl.bindBuffer(gl.ARRAY_BUFFER, particles);
        gl.enableVertexAttribArray(particleId);
        gl.vertexAttribPointer(particleId, 1, gl.FLOAT, false, 0, 0);
        gl.uniform1f(sw.uClock, clock);
        gl.uniform3f(sw.uCam, ...s.cam);
        gl.uniform1f(sw.uFov, s.fov);
        gl.uniform2f(sw.uShift, ...s.shift);
        gl.uniform1f(sw.uR, s.r);
        gl.uniform1f(sw.uRpx, s.rpx);
        gl.uniform2f(sw.uRot, ...s.rot);
        gl.uniform1f(sw.uSpin, s.spin);
        gl.uniform1f(sw.uShape, s.shape);
        gl.uniform1f(sw.uMorph, s.morph);
        gl.uniform1f(sw.uRing, s.ring);
        gl.uniform1f(sw.uGlow, s.glow);
        gl.uniform1f(sw.uScatter, s.scatter);
        gl.uniform1f(sw.uAssemble, s.assemble);
        gl.drawArrays(gl.POINTS, 0, count);
        gl.disableVertexAttribArray(particleId);
      },
      dispose() {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      },
    };
  } catch (error) {
    console.error("3D world unavailable, falling back to CSS", error);
    return null;
  }
}

// Spin kicked on the beat, summed in closed form: each kick adds angle that
// decays exponentially, so any t evaluates on its own.
const KICKS = [9, 10, 11, 12, 33, 34, 35, 36, 57, 59, 61];

function spinAt(t: number) {
  let spin = t * 0.18;
  for (const k of KICKS) {
    const dt = t - B(k);
    if (dt > 0) spin += 0.9 * (1 - Math.exp(-dt / 0.35));
  }
  return spin;
}

export const FOV = 0.62; // about 35°: a medium-telephoto lens, no wide-angle distortion
const REF_DISTANCE = 6;

export type Pointer = { x: number; y: number };

// Where everything is at time t. Positions are authored in screen space (where
// the swarm should sit, how big it should look) and converted to 3D, so it
// lands exactly on the headline's full stop and inside the sting circle.
export function worldAt(
  t: number,
  w: number,
  h: number,
  anchor: { x: number; y: number; r: number },
  pointer: Pointer,
): WorldState {
  const beat = t / BEAT;
  const min = Math.min(w, h);
  const cx = w / 2;
  const cy = h * 0.47;
  const wide = w >= 900;
  const fpx = h / 2 / Math.tan(FOV / 2);

  // Outcomes: swarm to the right of the text on desktop, above it on phones.
  const ox = wide ? w * 0.73 : cx;
  const oy = wide ? h * 0.5 : h * 0.3;
  const orad = wide ? Math.min(w * 0.13, h * 0.22) : Math.min(w * 0.24, h * 0.13);

  const x = track(t, [
    [0, anchor.x],
    [B(6), cx],
    [B(40), ox],
    [B(56), cx],
  ], 0.9, 0.85);
  const y = track(t, [
    [0, anchor.y],
    [B(6), cy],
    [B(40), oy],
    [B(56), h * 0.37],
  ], 0.9, 0.85);
  const rpx = Math.max(0, track(t, [
    [0, anchor.r],
    [B(6.5), min * 0.14],
    [B(38.5), 0],
    [B(40.6), orad],
    [B(56), min * 0.16],
  ], 0.6, 0.85));
  const r = (rpx * REF_DISTANCE) / fpx;

  // The dive: the camera flies into the swarm, then we are inside the orb.
  const dist = track(t, [
    [0, REF_DISTANCE],
    [B(12), r * 0.3 + 0.02],
    [B(16), REF_DISTANCE],
  ], 0.7, 1);

  // Orbit: a slow drift, a sweep around the sting, a turn per outcome.
  const outcomeTurn = beat > OUTCOME_FROM ? (beat - OUTCOME_FROM) * 0.06 : 0;
  const yaw =
    track(t, [
      [0, 0],
      [B(7), 0.35],
      [B(16), -0.2],
      [B(32), 0.95],
      [B(38.5), 0],
      [B(41), -0.45],
      [B(56), 0.3],
    ], 0.35, 0.9) +
    outcomeTurn -
    (beat > 56 ? (beat - 56) * 0.06 : 0) +
    pointer.x * 0.18;
  const pitch =
    track(t, [
      [0, 0],
      [B(7), 0.14],
      [B(32), -0.28],
      [B(41), 0.18],
      [B(56), 0.08],
    ], 0.35, 0.9) +
    pointer.y * 0.12;

  const cam: [number, number, number] = [
    dist * Math.sin(yaw) * Math.cos(pitch),
    dist * Math.sin(pitch),
    dist * Math.cos(yaw) * Math.cos(pitch),
  ];

  // Shape morph: one shape per outcome, streaming into the next over its last beats.
  let shape = 0;
  let morph = 0;
  if (beat > OUTCOME_FROM) {
    const k = Math.min(OUTCOME_COUNT - 1, Math.floor((beat - OUTCOME_FROM) / OUTCOME_BEATS));
    const local = beat - OUTCOME_FROM - k * OUTCOME_BEATS;
    shape = k;
    morph = smooth(range(local, OUTCOME_BEATS - 1.4, OUTCOME_BEATS));
  }

  // Bursts: the dive blows the swarm apart; it re-forms in the sting circle,
  // breathes out on every morph and bursts once more into the end card.
  const scatter =
    window4(beat, 13.4, 15, 30.6, 32.8) * 3.2 +
    Math.sin(Math.PI * morph) * 0.7 +
    window4(beat, 55, 55.8, 55.8, 57.4) * 1.1;

  // Pour out of the full stop; after the collapse, pour out again for the outcomes.
  const assemble = beat < 38.3 ? smooth(range(beat, 5.6, 8)) : smooth(range(beat, 40.2, 42.4));

  const spin = spinAt(t);
  const inside = track(t, [
    [0, 0],
    [B(13.2), 1],
    [B(16.5), 0.2],
    [B(38), 0],
  ], 0.9, 1);

  return {
    cam,
    fov: FOV,
    shift: [(x / w) * 2 - 1, 1 - (y / h) * 2],
    r,
    rpx,
    rot: [spin * 0.6, 0.35 * Math.sin(t * 0.4) + (beat > OUTCOME_FROM ? 0.4 : 0)],
    spin,
    shape,
    morph,
    ring: Math.max(window4(beat, 7, 8.5, 13, 14), window4(beat, 32, 33.5, 38, 38.6), window4(beat, 41.5, 43, 54.5, 55.5) * 0.8, range(beat, 57, 59)),
    atmos: track(t, [
      [0, 0.12],
      [B(16), 0],
      [B(40), 0.75],
      [B(55), 0.35],
    ], 0.6, 1),
    dust: track(t, [
      [0, 0.55],
      [B(11), 1],
      [B(17), 0.45],
      [B(41), 0.85],
      [B(56), 0.6],
    ], 0.6, 1),
    inside: Math.max(0, inside),
    glow: 1 + 0.15 * window4(beat, 10, 12, 13, 14),
    scatter,
    assemble,
  };
}
