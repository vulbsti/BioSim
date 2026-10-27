import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChartLine,
  ChevronLeft,
  Droplets,
  Info,
  Maximize,
  Minimize,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useSimulation } from "./use-simulation";
import { glucose, sample } from "./engine";
import type { Action, BodyState, Meal, Organ } from "./types";
import { scenarios } from "./scenarios";
import type { Atlas } from "../anatomy";
import { loadAtlas } from "../atlas-loader";
import BodyMap from "./BodyMap";
import Trace, { formatTime } from "./Trace";
import "./simulation.css";

/** What each organ does, in plain words, and what it is doing right now. */
const organInfo: Record<Organ, { what: string; in: string; out: string }> = {
  heart: {
    what: "Pumps blood around the body. It beats faster during exercise or stress, and each beat pushes out a little more.",
    in: "Used blood from the body, fresh blood from the lungs",
    out: "Blood to the lungs and to every organ",
  },
  lungs: {
    what: "Take oxygen out of the air into the blood and breathe out carbon dioxide. You breathe faster when the body needs more oxygen.",
    in: "Air, and oxygen-poor blood from the heart",
    out: "Oxygen-rich blood back to the heart, carbon dioxide out",
  },
  brain: {
    what: "Uses about a fifth of the body's oxygen and runs almost only on sugar. It sets heart rate, breathing and many hormones.",
    in: "Blood with oxygen and sugar",
    out: "Signals through nerves and hormones",
  },
  liver: {
    what: "Catches the sugar coming from the gut after a meal and stores it. Between meals it releases sugar to keep the blood level steady.",
    in: "Food-rich blood from the gut, oxygen from the arteries",
    out: "Sugar into the blood when the body needs it",
  },
  gut: {
    what: "Breaks food down and passes sugar, protein and fat into the blood. Sugar and protein go to the liver first; fat takes a slower route.",
    in: "Food and water",
    out: "Nutrients to the liver and blood",
  },
  kidneys: {
    what: "Filter the blood and decide how much water to keep. After a big drink they make more urine.",
    in: "About a fifth of all blood pumped",
    out: "Cleaned blood back, urine to the bladder",
  },
  muscle: {
    what: "Burn sugar and fat for movement. During exercise they take far more blood, oxygen and sugar. Insulin helps them take sugar in.",
    in: "Oxygen, sugar and fat from the blood",
    out: "Movement, heat, carbon dioxide",
  },
  skin: {
    what: "Lets heat out. When you are warm or exercising, more blood flows to the skin and you sweat.",
    in: "Warm blood",
    out: "Heat and sweat",
  },
  adipose: {
    what: "Body fat stores energy. It takes in fat after meals and releases it between meals and during long exercise.",
    in: "Fat from meals",
    out: "Fat as fuel for muscles and heart",
  },
  endocrine: {
    what: "Glands that release hormones into the blood: the pancreas (insulin), adrenal glands (adrenaline, cortisol), thyroid and pituitary.",
    in: "Signals from the brain and from blood sugar",
    out: "Hormones that tell organs what to do",
  },
};
function now(organ: Organ, s: BodyState): [string, string][] {
  const flow = s.flows.find((f) => f.id === organ)?.flow ?? 0;
  const rows: Record<Organ, [string, string][]> = {
    heart: [
      ["Beats per minute", s.heartRate.toFixed(0)],
      ["Blood pumped", `${s.cardiacOutput.toFixed(1)} L/min`],
      ["Blood pressure (average)", `${s.map.toFixed(0)} mmHg`],
    ],
    lungs: [
      ["Breaths per minute", s.respiratoryRate.toFixed(0)],
      ["Air per breath", `${s.tidalVolume.toFixed(0)} mL`],
      ["Blood oxygen", `${s.saturation.toFixed(0)}%`],
    ],
    brain: [
      ["Blood flow", `${(flow * 1000).toFixed(0)} mL/min`],
      ["Blood sugar", `${glucose(s).toFixed(0)} mg/dL`],
    ],
    liver: [
      ["Sugar stored (glycogen)", `${s.glycogen.toFixed(0)} g`],
      ["Blood sugar", `${glucose(s).toFixed(0)} mg/dL`],
    ],
    gut: [
      ["Food in the stomach", `${(s.stomach.carbs + s.stomach.protein + s.stomach.fat).toFixed(0)} g`],
      ["Food in the intestine", `${(s.gut.carbs + s.gut.protein + s.gut.fat).toFixed(0)} g`],
      ["Sugar entering blood", `${s.digestionRates.carbs.toFixed(2)} g/min`],
    ],
    kidneys: [
      ["Urine being made", `${s.urineRate.toFixed(1)} mL/min`],
      ["Bladder", `${s.bladder.toFixed(0)} mL`],
    ],
    muscle: [
      ["Blood flow", `${flow.toFixed(1)} L/min`],
      ["Sugar burned so far", `${s.glucoseUsed.toFixed(0)} g`],
    ],
    skin: [
      ["Body temperature", `${s.coreTemperature.toFixed(1)} °C`],
      ["Sweating", `${s.sweatRate.toFixed(1)} mL/min`],
    ],
    adipose: [
      ["Fat stored", `${(s.fatStore / 1000).toFixed(1)} kg`],
      ["Fat burned so far", `${s.fatUsed.toFixed(0)} g`],
    ],
    endocrine: [
      ["Insulin vs resting", `${s.hormones.insulin.toFixed(1)}×`],
      ["Adrenaline vs resting", `${s.hormones.epinephrine.toFixed(1)}×`],
      ["Cortisol vs resting", `${s.hormones.cortisol.toFixed(1)}×`],
    ],
  };
  return rows[organ];
}

export default function Simulator() {
  const { state: s, running, speed, timeline, error, send } = useSimulation();
  const [organ, setOrgan] = useState<Organ>("heart"),
    [scenario, setScenario] = useState("baseline"),
    [tryOpen, setTryOpen] = useState(() => window.innerWidth > 900),
    [chartOpen, setChartOpen] = useState(false),
    [aboutOpen, setAboutOpen] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [meal, setMeal] = useState<Meal>({ carbs: 60, protein: 20, fat: 15, water: 250, sodium: 500 }),
    [exercise, setExercise] = useState(s.inputs.exercise),
    [notice, setNotice] = useState(""),
    [atlas, setAtlas] = useState<Atlas | null>(null),
    [atlasError, setAtlasError] = useState(""),
    [reflex, setReflex] = useState(0);
  useEffect(() => setExercise(s.inputs.exercise), [s.inputs.exercise]);
  // A slider sends one change once it settles, not one per pixel dragged.
  useEffect(() => {
    if (exercise === s.inputs.exercise) return;
    const id = setTimeout(
      () => act({ kind: "environment", values: { exercise } }, exercise ? "Exercise changed" : "Resting"),
      400,
    );
    return () => clearTimeout(id);
  }, [exercise]);
  useEffect(() => {
    const abort = new AbortController();
    loadAtlas(abort.signal)
      .then(setAtlas)
      .catch((e) => {
        if (!abort.signal.aborted)
          setAtlasError(e instanceof Error ? e.message : "Could not load the body.");
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const history = useMemo(
    () => (s.history.at(-1)?.time === s.time ? s.history : [...s.history, sample(s)]),
    [s],
  );
  const act = (a: Action, label: string) => {
    setScenario("custom");
    send({ type: "action", action: a, label });
    setNotice(label);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => setNotice("Full screen is not available here"));
  };
  const current = scenarios.find((x) => x.id === scenario);
  return (
    <div className={`sim-app bio-app ${tryOpen ? "try-open" : ""} ${chartOpen ? "chart-open" : ""}`}>
      <BodyMap
        state={s}
        selected={organ}
        onSelect={setOrgan}
        running={running}
        atlas={atlas}
        catalogueError={atlasError}
        reflex={reflex}
        organCard={
          <>
            <p className="organ-what">{organInfo[organ].what}</p>
            <dl className="organ-now">
              {now(organ, s).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="organ-flow">
              <span>Gets</span>
              <p>{organInfo[organ].in}</p>
              <span>Sends</span>
              <p>{organInfo[organ].out}</p>
            </div>
            {organ === "kidneys" && s.bladder > 50 && (
              <button className="bio-secondary" onClick={() => act({ kind: "void" }, "Bladder emptied")}>
                Empty the bladder
              </button>
            )}
          </>
        }
      />
      <header className="bio-top">
        <div className="bio-brand">
          <Activity size={18} />
          <strong>BioSim</strong>
          <span>what is happening inside</span>
        </div>
        <div className="bio-playback" aria-label="Simulation playback">
          <strong className="bio-clock" aria-label="Elapsed simulation time">
            {formatTime(s.time)}
          </strong>
          <button className="bio-play" onClick={() => send({ type: "run", running: !running })}>
            {running ? <Pause size={15} /> : <Play size={15} />} {running ? "Pause" : "Play"}
          </button>
          <select
            aria-label="Simulation speed"
            value={speed}
            onChange={(e) => send({ type: "speed", speed: Number(e.target.value) })}
          >
            {[
              [1, "Real time"],
              [30, "1 min / 2 s"],
              [120, "1 min / ½ s"],
              [600, "10 min / s"],
              [3600, "1 hour / s"],
            ].map(([x, label]) => (
              <option key={x} value={x}>
                {label}
              </option>
            ))}
          </select>
          <button aria-label="Advance five minutes" title="Skip ahead 5 minutes" onClick={() => send({ type: "advance", seconds: 300 })}>
            +5 min
          </button>
          <button aria-label="Advance one hour" title="Skip ahead 1 hour" onClick={() => send({ type: "advance", seconds: 3600 })}>
            +1 h
          </button>
          <button
            aria-label="Start again"
            title="Start again"
            onClick={() => {
              send({ type: "reset" });
              setScenario("baseline");
            }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="bio-top-actions">
          <button aria-pressed={chartOpen} onClick={() => setChartOpen((v) => !v)}>
            <ChartLine size={15} /> <span>Over time</span>
          </button>
          <button aria-label={fullscreen ? "Leave full screen" : "Full screen"} title={fullscreen ? "Leave full screen" : "Full screen"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
          <button aria-label="About this simulation" title="About" onClick={() => setAboutOpen(true)}>
            <Info size={15} />
          </button>
        </div>
      </header>
      {error && (
        <div className="bio-error" role="alert">
          {error}
        </div>
      )}
      {tryOpen ? (
        <aside className="bio-try" aria-label="Try something">
          <div className="bio-try-head">
            <h2>
              <Sparkles size={15} /> Try something
            </h2>
            <button aria-label="Hide this panel" onClick={() => setTryOpen(false)}>
              <ChevronLeft size={16} />
            </button>
          </div>
          <div className="bio-scenarios">
            {scenarios.map((x) => (
              <button
                key={x.id}
                aria-pressed={scenario === x.id}
                onClick={() => {
                  setScenario(x.id);
                  send({ type: "scenario", id: x.id });
                  if (x.events.length) send({ type: "run", running: true });
                }}
              >
                {x.name}
              </button>
            ))}
          </div>
          {current && <p className="bio-note">{current.description}</p>}
          <h3>Eat something</h3>
          <div className="bio-meal">
            {(
              [
                { k: "carbs", label: "Carbs", max: 300 },
                { k: "protein", label: "Protein", max: 200 },
                { k: "fat", label: "Fat", max: 150 },
              ] as const
            ).map((f) => (
              <label key={f.k}>
                {f.label}
                <span>
                  <input
                    type="number"
                    aria-label={f.label}
                    min={0}
                    max={f.max}
                    value={meal[f.k]}
                    onChange={(e) =>
                      setMeal((m) => ({ ...m, [f.k]: Math.min(f.max, Math.max(0, Number(e.target.value))) }))
                    }
                  />
                  g
                </span>
              </label>
            ))}
          </div>
          <div className="bio-row">
            <button className="bio-primary" onClick={() => act({ kind: "meal", meal }, "Meal eaten")}>
              <Plus size={14} /> Eat it
            </button>
            <button
              className="bio-secondary"
              onClick={() =>
                act({ kind: "meal", meal: { carbs: 0, protein: 0, fat: 0, water: 250, sodium: 0 } }, "Glass of water")
              }
            >
              <Droplets size={14} /> Glass of water
            </button>
          </div>
          <h3>Move</h3>
          <label className="bio-slider">
            <span>
              Exercise <output>{exercise === 0 ? "resting" : exercise < 0.35 ? "walking" : exercise < 0.7 ? "jogging" : "hard"}</output>
            </span>
            <input
              type="range"
              aria-label="Exercise"
              min={0}
              max={1}
              step={0.05}
              value={exercise}
              onChange={(e) => setExercise(Number(e.target.value))}
            />
          </label>
          <h3>Nerves</h3>
          <button className="bio-secondary" onClick={() => setReflex((n) => n + 1)}>
            <Zap size={14} /> Tap below the kneecap
          </button>
        </aside>
      ) : (
        <button className="bio-try-open" onClick={() => setTryOpen(true)}>
          <Sparkles size={14} /> Try something
        </button>
      )}
      {chartOpen && (
        <section className="bio-chart" aria-label="Over time">
          <button className="bio-chart-close" aria-label="Close chart" onClick={() => setChartOpen(false)}>
            <X size={15} />
          </button>
          <Trace samples={history} time={s.time} />
          {timeline.times.length > 1 && (
            <div className={`bio-lookback ${timeline.viewing !== null ? "viewing" : ""}`}>
              <span>Look back</span>
              <input
                type="range"
                aria-label="Look back in simulated time"
                min={0}
                max={timeline.times.length - 1}
                step={1}
                value={timeline.viewing === null ? timeline.times.length - 1 : timeline.times.indexOf(timeline.viewing)}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  send({ type: "view", time: i >= timeline.times.length - 1 ? null : timeline.times[i] });
                }}
              />
              {timeline.viewing !== null && (
                <>
                  <strong>{formatTime(timeline.viewing)}</strong>
                  <button onClick={() => send({ type: "view", time: null })}>Back to now</button>
                  <button onClick={() => send({ type: "continue" })}>Carry on from here</button>
                </>
              )}
            </div>
          )}
        </section>
      )}
      {notice && (
        <div className="bio-toast" role="status">
          {notice}
        </div>
      )}
      {aboutOpen && (
        <div className="bio-overlay" onClick={() => setAboutOpen(false)}>
          <section className="bio-about" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
            <button className="bio-about-close" aria-label="Close about" onClick={() => setAboutOpen(false)} autoFocus>
              <X size={18} />
            </button>
            <h2 id="about-title">What you are looking at</h2>
            <p>
              A rough, moving picture of a typical adult body: how blood, oxygen, food and a few hormones travel between
              organs and how the organs respond. It is an illustration to help you understand, not a diagnosis.
            </p>
            <p>
              Speeds, sizes and particle counts are exaggerated so they can be seen. The direction and timing of changes
              are what the model tries to get right.
            </p>
            <p>
              Next, the body will start from your own measurements: blood tests, a glucose sensor, a fitness band, and
              later EEG and gut microbiome reports.
            </p>
            <p className="bio-note">
              Anatomy: BodyParts3D, © The Database Center for Life Science, CC BY 4.0. <a href="/ATTRIBUTION.md" target="_blank" rel="noreferrer">All sources</a>
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
