import * as T from 'three';
import type {Atlas} from '../anatomy';
import {CAPTIONS,LEG_POSE_GLSL,SEATED,SLOW,frameAt,pointAt,reflexTiming,route,schedule,type Frame,type KneeJerkRoutes,type LegJoints,type Stage,type Timing} from './knee-jerk';

type Paths = {kneeJerk: Record<keyof KneeJerkRoutes, {to: string; points: number[]}[]>; joints: LegJoints; cord: string};
/** Uniforms every body material shares to pose the legs; add them with LEG_POSE_GLSL. */
export function legUniforms() {
  const v = () => [new T.Vector3(), new T.Vector3()];
  return {legHip: {value: v()}, legKnee: {value: v()}, legAnkle: {value: v()}, legToe: {value: v()}, legAngle: {value: [new T.Vector2(), new T.Vector2()]}};
}
export type LegUniforms = ReturnType<typeof legUniforms>;
/** Pose a body material's vertices and normals. Call inside onBeforeCompile after the material's own edits. */
export function poseShader(shader: {vertexShader: string}) {
  shader.vertexShader = LEG_POSE_GLSL + '\n' + shader.vertexShader
    .replace('#include <defaultnormal_vertex>', 'objectNormal = normalize(poseLeg(position + objectNormal * 0.003) - poseLeg(position));\n#include <defaultnormal_vertex>')
    .replace('#include <project_vertex>', 'transformed = poseLeg(transformed);\n#include <project_vertex>');
}

const COLOURS = {afferent: new T.Color('#8ff3ff'), efferent: new T.Color('#ffb24a'), inhibitory: new T.Color('#c4a0ff')};
const TRAIN = 18, SPACING = 0.006, LIMIT = 1200;
const STEPS: Exclude<Stage, 'ready'>[] = ['tap', 'sensory', 'cord', 'motor', 'kick'];

/**
 * The knee-jerk reflex drawn on the body: the legs sit, a tap, signals travelling the real nerves,
 * quadriceps tightening (warm) while the hamstrings relax (cool), and the kick.
 */
export function createReflexLayer({el, scene, atlas, uniforms, visual, signal, changed}: {
  el: HTMLElement; scene: T.Scene; atlas: Atlas; uniforms: LegUniforms;
  visual: {data: Float32Array; texture: T.DataTexture; restyle: () => void}; signal: AbortSignal; changed: () => void;
}) {
  let routes: KneeJerkRoutes | null = null, timing: Timing | null = null, clock = -1, loading: Promise<void> | null = null, lit = false;
  const positions = new Float32Array(LIMIT * 3), colours = new Float32Array(LIMIT * 3), geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colours, 3));
  geometry.setDrawRange(0, 0);
  // Signals glow through the nerve wall and the muscles around it, like the blood beads do.
  const material = new T.PointsMaterial({size: 0.03, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false});
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    poseShader(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat r = distance(gl_PointCoord, vec2(0.5)); if(r > 0.5) discard;');
  };
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 7;
  scene.add(points);

  const index = (re: RegExp) => atlas.parts.flatMap((p, i) => (re.test(p.name) ? [i] : []));
  const quadriceps = index(/^right (rectus femoris|vastus (lateralis|medialis|intermedius))$/i);
  const hamstrings = index(/^(long head of right biceps femoris|right semitendinosus|right semimembranosus)$/i);
  const sensoryNerves = index(/^(right femoral nerve|muscular branch of right femoral nerve .*|posterior root of right spinal nerve|right spinal ganglia)$/i);
  const motorNerves = index(/^(right femoral nerve|muscular branch of right femoral nerve .*|anterior root of right spinal nerve)$/i);
  const inhibitoryNerves = index(/^(cauda equina|right sciatic nerve|muscular branch of right sciatic nerve .*)$/i);
  const cord = index(/^spinal cord$/i);

  const panel = document.createElement('div');
  panel.className = 'physical-reflex';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Knee-jerk reflex');
  panel.innerHTML = `<strong>KNEE-JERK REFLEX</strong><ol>${STEPS.map((s, i) => `<li><button type="button" data-step="${s}" aria-pressed="false"><b>${i + 1}</b>${CAPTIONS[s]}</button></li>`).join('')}</ol><div class="legend"><span><i style="background:#8ff3ff"></i>sensing</span><span><i style="background:#ffb24a"></i>command to tighten</span><span><i style="background:#c4a0ff"></i>command to relax</span></div><p></p><button type="button" class="again">Tap again</button>`;
  el.appendChild(panel);
  const note = panel.querySelector('p')!, buttons = [...panel.querySelectorAll<HTMLButtonElement>('[data-step]')];
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || !timing) return;
    if (b.classList.contains('again')) clock = 0;
    else clock = stepTime(b.dataset.step as Exclude<Stage, 'ready'>);
    changed();
  });
  /** A moment that shows a step well: signals half way along, the kick at its height. */
  const stepTime = (s: Exclude<Stage, 'ready'>) => {
    const k = schedule(timing!);
    return {tap: k.tap + 0.2, sensory: (k.sensory + k.cord) / 2, cord: k.cord + 0.04, motor: (k.motor + k.kick) / 2, kick: k.kick + k.rise}[s];
  };

  const load = () => loading ??= fetch('/models/nerve-paths.json', {signal}).then(async (r) => {
    if (!r.ok) throw new Error('The nerve paths could not be loaded.');
    const paths = await r.json() as Paths;
    routes = {afferent: [], efferent: [], inhibitory: []};
    for (const kind of ['afferent', 'efferent', 'inhibitory'] as const) routes[kind] = paths.kneeJerk[kind].map((x) => route(x.to, x.points));
    timing = reflexTiming(routes);
    for (const [s, j] of [paths.joints.right, paths.joints.left].entries()) {
      uniforms.legHip.value[s].fromArray(j.hip); uniforms.legKnee.value[s].fromArray(j.knee);
      uniforms.legAnkle.value[s].fromArray(j.ankle); uniforms.legToe.value[s].fromArray(j.toe);
    }
    el.dataset.reflexLatencyMs = (timing.muscleOnset * 1000).toFixed(1);
    el.dataset.reflexAfferentMm = (Math.max(...routes.afferent.map((x) => x.lengths[x.lengths.length - 1])) * 1000).toFixed(0);
    note.textContent = `Signals slowed about ${SLOW}×. In life the tap-to-muscle loop takes about ${(timing.muscleOnset * 1000).toFixed(0)} thousandths of a second.`;
  });

  const glow = (parts: number[], level: number) => {for (const i of parts) {visual.data[i * 4 + 2] = level; visual.data[i * 4 + 3] = 1;}};
  const paint = (f: Frame) => {
    const off = 0.5;
    glow(sensoryNerves, Number.isNaN(f.afferent) ? off : 0.95);
    glow(motorNerves, Number.isNaN(f.efferent) ? (Number.isNaN(f.afferent) ? off : 0.95) : 0.95);
    glow(inhibitoryNerves, Number.isNaN(f.inhibitory) ? off : 0.15);
    glow(cord, f.stage === 'cord' ? 1 : off + 0.15);
    // Warm: tightening (or stretched by the tap). Cool: held relaxed.
    glow(quadriceps, 0.5 + 0.5 * Math.max(f.quadriceps, f.stretch * 0.5));
    glow(hamstrings, 0.5 - 0.42 * f.hamstrings);
    visual.texture.needsUpdate = true;
    lit = true;
  };
  const clear = () => {
    if (!lit) return;
    for (const i of [...sensoryNerves, ...motorNerves, ...inhibitoryNerves, ...cord, ...quadriceps, ...hamstrings]) {visual.data[i * 4 + 2] = 0.5; visual.data[i * 4 + 3] = 0;}
    visual.texture.needsUpdate = true;
    visual.restyle();
    lit = false;
  };

  return {
    /** Sit the body down and tap the knee. */
    start() {
      load().then(() => {clock = 0; changed();}).catch((e) => {el.dataset.reflexError = e instanceof Error ? e.message : 'unavailable';});
    },
    /** Stand up again; the reflex view is closed. */
    stop() {
      if (clock < 0) return;
      clock = -1;
      for (const a of uniforms.legAngle.value) a.set(0, 0);
      geometry.setDrawRange(0, 0);
      panel.hidden = true;
      delete el.dataset.reflexStage;
      clear();
      changed();
    },
    active: () => clock >= 0,
    /** Advance by dt display seconds (0 holds the moment) and draw. */
    frame(dt: number) {
      if (clock < 0 || !routes || !timing) return;
      const k = schedule(timing);
      clock = Math.min(clock + dt, k.end);
      const f = frameAt(timing, clock);
      uniforms.legAngle.value[0].set(f.hip, f.knee);
      uniforms.legAngle.value[1].set(SEATED.hip * f.seated, SEATED.knee * f.seated);
      let n = 0;
      for (const kind of ['afferent', 'efferent', 'inhibitory'] as const) {
        const front = f[kind];
        if (Number.isNaN(front)) continue;
        for (const r of routes[kind]) for (let b = 0; b < TRAIN && n < LIMIT; b++) {
          const d = front - b * SPACING;
          if (d < 0) break;
          pointAt(r, d, positions, n * 3);
          const fade = 1 - b / TRAIN;
          colours[n * 3] = COLOURS[kind].r * fade + 0.1; colours[n * 3 + 1] = COLOURS[kind].g * fade + 0.1; colours[n * 3 + 2] = COLOURS[kind].b * fade + 0.1;
          n++;
        }
      }
      geometry.setDrawRange(0, n);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      paint(f);
      panel.hidden = false;
      for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.step === f.stage));
      el.dataset.reflexStage = f.stage;
      el.dataset.reflexKnee = (f.knee * 180 / Math.PI).toFixed(1);
      el.dataset.reflexSignals = String(n);
    },
    dispose() {geometry.dispose(); material.dispose(); panel.remove();},
  };
}
export type ReflexLayer = ReturnType<typeof createReflexLayer>;
