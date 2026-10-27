/**
 * The knee-jerk (patellar) reflex on the registered nerves.
 *
 * A tap on the tendon below the kneecap stretches quadriceps. Stretch receptors (muscle spindles) in
 * each head fire; the signal runs up the femoral nerve and the posterior (sensory) root into the
 * spinal cord at L3, crosses one synapse onto the motor neurons, and comes straight back out the
 * anterior (motor) root and down the same nerve to the same muscle, which contracts and swings the
 * lower leg forward. A side branch through one more synapse (an inhibitory interneuron) runs down
 * the cauda equina and the sciatic nerve and lets the hamstrings relax so they do not resist.
 *
 * Timing comes from the routes' real lengths on the body and published conduction speeds, then is
 * slowed by SLOW so a person can follow it. The routes and joints are built by
 * scripts/nerves/build-nerves.py into /models/nerve-paths.json.
 */
export type Route = {to: string; points: Float32Array; lengths: Float32Array};
export type KneeJerkRoutes = {afferent: Route[]; efferent: Route[]; inhibitory: Route[]};
export type Joints = {hip: [number, number, number]; knee: [number, number, number]; ankle: [number, number, number]; toe: [number, number, number]};
export type LegJoints = {right: Joints; left: Joints};

/** Ia sensory fibres conduct at about 60–80 m/s; alpha motor fibres at about 50–70 m/s. */
export const SPEED = {afferent: 70, efferent: 60, inhibitory: 60};
/** One central synapse takes about 0.5–1 ms; the inhibitory path has one more. */
export const SYNAPSE = 0.0008;
/** Nerve to muscle (neuromuscular junction and muscle action potential), about 1–2 ms. */
export const JUNCTION = 0.0015;
/** Display seconds per real second while signals travel. */
export const SLOW = 100;
/** Seated, as on the edge of an examination couch: hip and knee bent, lower leg hanging. Radians. */
export const SEATED = {hip: -80 * Math.PI / 180, knee: 82 * Math.PI / 180};
/** How far the kick straightens the knee from hanging, radians. */
export const KICK = 38 * Math.PI / 180;

export function route(to: string, points: number[]): Route {
  const p = new Float32Array(points), n = p.length / 3, lengths = new Float32Array(n);
  for (let i = 1; i < n; i++) lengths[i] = lengths[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2], p[i * 3 + 2] - p[i * 3 - 1]);
  return {to, points: p, lengths};
}
export const length = (r: Route) => r.lengths[r.lengths.length - 1];

/** Point at distance `d` along a route, written into `out`. */
export function pointAt(r: Route, d: number, out: number[] | Float32Array, at = 0) {
  const n = r.lengths.length, s = Math.min(Math.max(d, 0), r.lengths[n - 1]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {const mid = (lo + hi) >> 1; if (r.lengths[mid] <= s) lo = mid; else hi = mid;}
  const t = (s - r.lengths[lo]) / Math.max(1e-9, r.lengths[hi] - r.lengths[lo]);
  for (let k = 0; k < 3; k++) out[at + k] = r.points[lo * 3 + k] + (r.points[hi * 3 + k] - r.points[lo * 3 + k]) * t;
}

/** Real-time milestones of one reflex, seconds after the tap. */
export function reflexTiming(routes: KneeJerkRoutes) {
  const longest = (rs: Route[]) => Math.max(...rs.map(length));
  const afferent = longest(routes.afferent) / SPEED.afferent;
  const efferent = longest(routes.efferent) / SPEED.efferent;
  const inhibitory = longest(routes.inhibitory) / SPEED.inhibitory;
  const motorStart = afferent + SYNAPSE;
  const muscleOnset = motorStart + efferent + JUNCTION;
  return {
    afferent, efferent, inhibitory,
    /** Signal reaches the cord. */
    atCord: afferent,
    /** Motor neurons fire. */
    motorStart,
    /** Quadriceps electrical response begins: the reflex latency a clinician would measure. */
    muscleOnset,
    /** Hamstring motor neurons are held off. */
    hamstringsOff: motorStart + SYNAPSE + inhibitory + JUNCTION,
  };
}
export type Timing = ReturnType<typeof reflexTiming>;

export type Stage = 'ready' | 'tap' | 'sensory' | 'cord' | 'motor' | 'kick';
export const CAPTIONS: Record<Exclude<Stage, 'ready'>, string> = {
  tap: 'The tap stretches the thigh muscle',
  sensory: 'Stretch sensors send a signal up the nerve to the spinal cord',
  cord: 'In the spinal cord it passes straight to the nerve cells that move the muscle',
  motor: 'A command runs back down the same nerve; the back of the thigh is told to relax',
  kick: 'The thigh muscle tightens and the lower leg kicks forward',
};

/** Display-time schedule: a short lead-in to sit down and tap, then signals at SLOW, then the kick near real speed. */
export function schedule(t: Timing) {
  const settle = 0.9, tap = 0.35;
  const sensory = settle + tap, cord = sensory + t.afferent * SLOW, motor = cord + SYNAPSE * SLOW;
  const kick = sensory + (t.muscleOnset) * SLOW, inhibit = sensory + t.motorStart * SLOW + SYNAPSE * SLOW;
  return {settle, tap: settle, sensory, cord, motor, inhibit, kick, rise: 0.35, hold: 0.25, fall: 0.9, end: kick + 0.35 + 0.25 + 0.9 + 0.6};
}

const ease = (x: number) => {const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c);};

export type Frame = {
  stage: Stage;
  /** Front of each travelling signal, metres along its route; NaN when the route is idle. */
  afferent: number; efferent: number; inhibitory: number;
  /** 0 rest → 1 fully active (quadriceps) or fully relaxed (hamstrings). */
  quadriceps: number; hamstrings: number;
  /** How much the tap has stretched quadriceps, 0..1. */
  stretch: number;
  /** Right-leg joint angles, radians (hip negative = thigh forward; knee positive = bent back). */
  hip: number; knee: number;
  /** Seat pose of the left leg, 0..1. */
  seated: number;
  /** Real seconds since the tap, for the clock in the caption. */
  real: number;
};

/** The state of the reflex `s` display seconds after it was started. */
export function frameAt(t: Timing, s: number): Frame {
  const k = schedule(t), sit = ease(s / k.settle);
  const real = Math.max(0, (s - k.sensory) / SLOW);
  const stretch = s >= k.tap && s < k.sensory + 0.4 ? Math.sin(Math.PI * Math.min(1, (s - k.tap) / 0.5)) : 0;
  const run = (start: number, speed: number, len: number) => s < start ? NaN : Math.min(len, (s - start) / SLOW * speed);
  const afferent = s < k.cord + 0.3 ? run(k.sensory, SPEED.afferent, t.afferent * SPEED.afferent) : NaN;
  const efferent = s < k.kick + 0.2 ? run(k.motor, SPEED.efferent, t.efferent * SPEED.efferent) : NaN;
  const inhibitory = s < k.kick + 0.6 ? run(k.inhibit, SPEED.inhibitory, t.inhibitory * SPEED.inhibitory) : NaN;
  const up = ease((s - k.kick) / k.rise), down = ease((s - k.kick - k.rise - k.hold) / k.fall);
  const quadriceps = up * (1 - down);
  const hamstrings = s < k.inhibit + t.inhibitory * SLOW ? 0 : 1 - down;
  const stage: Stage = s < k.tap ? 'ready' : s < k.sensory ? 'tap' : s < k.cord ? 'sensory' : s < k.motor + 0.15 ? 'cord' : s < k.kick ? 'motor' : 'kick';
  return {stage, afferent, efferent, inhibitory, quadriceps, hamstrings, stretch, real, seated: sit,
    hip: SEATED.hip * sit, knee: SEATED.knee * sit - KICK * quadriceps};
}

/**
 * The leg pose, applied the same way to every vertex in the scene (bones, muscles, vessels, nerves,
 * skin) so nothing comes apart: the knee bends about the knee, then the whole leg about the hip.
 * A vertex belongs to a leg by its distance from the line hip-knee-ankle-toe and by side; the
 * weights blend over a few centimetres so skin and muscle bend rather than tear.
 * Keep `poseLeg` and LEG_POSE_GLSL identical.
 */
export const LEG_POSE_GLSL = `
uniform vec3 legHip[2]; uniform vec3 legKnee[2]; uniform vec3 legAnkle[2]; uniform vec3 legToe[2]; uniform vec2 legAngle[2];
float legSegment(vec3 p, vec3 a, vec3 b){ vec3 ab = b - a; float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * h); }
vec3 legRotate(vec3 p, vec3 c, float a){ vec3 d = p - c; float cs = cos(a), sn = sin(a); return c + vec3(d.x, d.y * cs - d.z * sn, d.y * sn + d.z * cs); }
vec3 poseLeg(vec3 p){
 for(int s = 0; s < 2; s++){
  if(abs(legAngle[s].x) + abs(legAngle[s].y) < 1e-5) continue;
  float side = s == 0 ? 1.0 - smoothstep(-0.035, -0.008, p.x) : smoothstep(0.008, 0.035, p.x);
  float near = min(min(legSegment(p, legHip[s], legKnee[s]), legSegment(p, legKnee[s], legAnkle[s])), legSegment(p, legAnkle[s], legToe[s]));
  float w = side * (1.0 - smoothstep(0.11, 0.15, near));
  float wk = w * (1.0 - smoothstep(legKnee[s].y - 0.035, legKnee[s].y + 0.035, p.y));
  float wh = w * (1.0 - smoothstep(legHip[s].y - 0.11, legHip[s].y + 0.02, p.y));
  p = legRotate(p, legKnee[s], legAngle[s].y * wk);
  p = legRotate(p, legHip[s], legAngle[s].x * wh);
 }
 return p;
}`;

const smooth = (a: number, b: number, x: number) => {const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t);};
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function segment(p: number[], a: number[], b: number[]) {
  const ab = sub(b, a), h = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)));
  return Math.hypot(p[0] - a[0] - ab[0] * h, p[1] - a[1] - ab[1] * h, p[2] - a[2] - ab[2] * h);
}
function rotate(p: number[], c: number[], a: number) {
  const d = sub(p, c), cs = Math.cos(a), sn = Math.sin(a);
  return [c[0] + d[0], c[1] + d[1] * cs - d[2] * sn, c[2] + d[1] * sn + d[2] * cs];
}
/** JavaScript twin of LEG_POSE_GLSL; angles are [hip, knee] per side, right first. */
export function poseLeg(point: ArrayLike<number>, joints: LegJoints, angles: [[number, number], [number, number]]): number[] {
  let p = [point[0], point[1], point[2]];
  ([joints.right, joints.left] as Joints[]).forEach((j, s) => {
    const [hip, knee] = angles[s];
    if (Math.abs(hip) + Math.abs(knee) < 1e-5) return;
    const side = s === 0 ? 1 - smooth(-0.035, -0.008, p[0]) : smooth(0.008, 0.035, p[0]);
    const near = Math.min(segment(p, j.hip, j.knee), segment(p, j.knee, j.ankle), segment(p, j.ankle, j.toe));
    const w = side * (1 - smooth(0.11, 0.15, near));
    const wk = w * (1 - smooth(j.knee[1] - 0.035, j.knee[1] + 0.035, p[1]));
    const wh = w * (1 - smooth(j.hip[1] - 0.11, j.hip[1] + 0.02, p[1]));
    p = rotate(p, j.knee, knee * wk);
    p = rotate(p, j.hip, hip * wh);
  });
  return p;
}
