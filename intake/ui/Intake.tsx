import { useEffect, useRef, useState } from "react";
import { FileUp, FlaskConical, Trash2, Upload } from "lucide-react";
import type { PersonalBaseline, Baseline } from "../../app/personal/baseline";
import type { DayReplay } from "../../app/personal/day";

type Summary = {
  id: string;
  name: string;
  size: number;
  kind: string;
  steps: { step: string; detail: string }[];
  warnings: string[];
  labs: { name: string; entered: { value: number; unit: string }; value: number; unit: string }[];
  unused: { name: string; value: number; unit: string }[];
};
type Personal = { baseline: Baseline; days: { day: number; coverage: number }[] };

const SAMPLES = ["sam-dexcom.csv", "sam-apple-health.xml", "sam-blood-test.pdf"];
const PARAMS: Record<keyof PersonalBaseline, string> = {
  insulinSensitivity: "How readily muscles and fat take up sugar",
  betaCellResponse: "How much insulin the pancreas makes",
  metabolicRate: "How fast cells burn fuel",
  kidneyClearance: "How much blood the kidneys clean",
  oxygenCarrying: "How much oxygen the blood carries",
  restingHeartRate: "Resting heart rate",
  autonomicTone: "Calm (vagus) or stress side of the nervous system",
};
const show = (k: keyof PersonalBaseline, v: number) =>
  k === "restingHeartRate" ? `${v} bpm` : k === "autonomicTone" ? (v < -0.15 ? "leans calm" : v > 0.15 ? "leans stress" : "balanced") : `${Math.round(v * 100)}% of typical`;
const dayName = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const clock = (t: number) => new Date(t).toISOString().slice(11, 16);
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/${path}`, init);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body as T;
}

export default function Intake() {
  const [status, setStatus] = useState<{ model: string | null } | null>(null),
    [files, setFiles] = useState<Summary[]>([]),
    [busy, setBusy] = useState<string[]>([]),
    [error, setError] = useState(""),
    [personal, setPersonal] = useState<Personal | null>(null),
    [day, setDay] = useState<number | null>(null),
    [replay, setReplay] = useState<DayReplay | null>(null),
    [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    setFiles(await api<Summary[]>("uploads"));
    setPersonal(await api<Personal>("personal"));
  };
  useEffect(() => {
    api<{ model: string | null }>("status")
      .then(setStatus)
      .then(refresh)
      .catch(() => setError("The intake backend is not running. Start it with: npx tsx intake/server.ts"));
  }, []);
  const good = personal?.days.filter((d) => d.coverage > 0.5) ?? [];
  const chosen = day ?? good.at(-2)?.day ?? good.at(-1)?.day ?? null;
  useEffect(() => {
    if (chosen === null) return setReplay(null);
    api<DayReplay>(`replay?day=${chosen}`).then(setReplay).catch((e) => setError(e.message));
  }, [chosen, files.length]);

  const upload = async (list: { name: string; blob: Blob }[]) => {
    setError("");
    setBusy((b) => [...b, ...list.map((f) => f.name)]);
    for (const f of list) {
      try {
        await api("uploads", { method: "POST", headers: { "x-filename": encodeURIComponent(f.name) }, body: f.blob });
      } catch (e) {
        setError(`${f.name}: ${e instanceof Error ? e.message : e}`);
      }
      setBusy((b) => b.filter((n) => n !== f.name));
      await refresh();
    }
  };
  const samples = async () =>
    upload(await Promise.all(SAMPLES.map(async (name) => ({ name, blob: await (await fetch(`/samples/personal/${name}`)).blob() }))));

  return (
    <main className="intake">
      <header>
        <div>
          <h1>Bring your data</h1>
          <p>
            Glucose sensor exports, fitness band exports and blood test reports. Files are read here, on this machine;{" "}
            {status?.model ? (
              <>reports the parsers can’t read (PDFs, photos, unusual files) are read by {status.model}.</>
            ) : (
              <>no language model is set up, so only files the built-in parsers know are read.</>
            )}
          </p>
        </div>
        <a href="/">Open the body →</a>
      </header>

      <section
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload([...e.dataTransfer.files].map((f) => ({ name: f.name, blob: f })));
        }}
      >
        <FileUp size={26} />
        <p>Drop files here</p>
        <div className="row">
          <button className="primary" onClick={() => input.current?.click()}>
            <Upload size={15} /> Choose files
          </button>
          <button onClick={samples} disabled={busy.length > 0}>
            <FlaskConical size={15} /> Use sample data
          </button>
        </div>
        <small>Libre or Dexcom CSV · Apple Health export.xml · Oura JSON · band CSV · FHIR · lab report PDF or photo</small>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Choose files"
          onChange={(e) => {
            upload([...(e.target.files ?? [])].map((f) => ({ name: f.name, blob: f })));
            e.target.value = "";
          }}
        />
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      {busy.map((n) => (
        <p key={n} className="busy">Reading {n}…</p>
      ))}

      <div className="cols">
        <section aria-label="Files">
          <h2>Files</h2>
          {!files.length && <p className="quiet">Nothing yet.</p>}
          {files.map((f) => (
            <article key={f.id} className="file">
              <div className="file-head">
                <div>
                  <strong>{f.name}</strong>
                  <span className="tag">{f.kind}</span>
                  <small>{size(f.size)}</small>
                </div>
                <button aria-label={`Remove ${f.name}`} onClick={() => api(`uploads/${f.id}`, { method: "DELETE" }).then(refresh)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <ol className="steps">
                {f.steps.map((s, i) => (
                  <li key={i} className={s.step}>
                    <span>{s.step === "model" ? "Language model" : s.step === "parser" ? "Parser" : s.step === "detect" ? "File" : "Found"}</span>
                    {s.detail}
                  </li>
                ))}
              </ol>
              {f.labs.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>On the report</th>
                      <th>Used as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.labs.map((l) => (
                      <tr key={l.name}>
                        <td>{l.name}</td>
                        <td>
                          {l.entered.value} {l.entered.unit}
                        </td>
                        <td>
                          {+l.value.toPrecision(3)} {l.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {f.warnings.map((w) => (
                <p key={w} className="warn">{w}</p>
              ))}
            </article>
          ))}
        </section>

        <section aria-label="What it means">
          <h2>What it means for the body</h2>
          {personal &&
            (Object.keys(PARAMS) as (keyof PersonalBaseline)[])
              .filter((k) => personal.baseline.reasons[k])
              .map((k) => (
                <div key={k} className="param">
                  <div>
                    <span>{PARAMS[k]}</span>
                    <strong>{show(k, personal.baseline.params[k])}</strong>
                  </div>
                  <p>{personal.baseline.reasons[k]!.why}</p>
                  <small>
                    From {personal.baseline.reasons[k]!.from.join(", ")}
                    {personal.baseline.reasons[k]!.confidence === "rough" ? " · rough" : ""}
                  </small>
                </div>
              ))}
          {personal && !Object.keys(personal.baseline.reasons).length && <p className="quiet">Add a blood test or band export to see this.</p>}
          {personal && personal.baseline.missing.length > 0 && (
            <p className="quiet">Nothing yet speaks to: {personal.baseline.missing.join(", ")}.</p>
          )}

          {good.length > 0 && chosen !== null && (
            <>
              <h2>A day to replay</h2>
              <select aria-label="Day" value={chosen} onChange={(e) => setDay(Number(e.target.value))}>
                {good.map((d) => (
                  <option key={d.day} value={d.day}>
                    {dayName(d.day)}
                  </option>
                ))}
              </select>
              {replay && <DayChart replay={replay} />}
              {replay && (
                <ul className="events">
                  {replay.scenario.events.map((e, i) => (
                    <li key={i}>
                      <span>{clock(replay.start + e.at * 1000)}</span> {e.label.replace(/ at \d\d:\d\d/, "")}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

/** The measured glucose for the replayed day, with the meals found in it. */
function DayChart({ replay }: { replay: DayReplay }) {
  const g = replay.measured.glucose;
  if (!g.length) return null;
  const lo = Math.min(60, ...g.map((p) => p.value)),
    hi = Math.max(180, ...g.map((p) => p.value));
  const x = (s: number) => 40 + (s / 86400) * 640,
    y = (v: number) => 170 - ((v - lo) / (hi - lo)) * 150;
  const path = g.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 700 200" className="day" role="img" aria-label="Measured glucose for the day, with meals found">
      {[lo, (lo + hi) / 2, hi].map((v) => (
        <g key={v}>
          <line x1="40" x2="680" y1={y(v)} y2={y(v)} className="grid" />
          <text x="34" y={y(v) + 4} textAnchor="end">{Math.round(v)}</text>
        </g>
      ))}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={x(h * 3600)} y="192" textAnchor="middle">{clock(replay.start + h * 3_600_000)}</text>
      ))}
      {replay.meals.map((m) => {
        const s = (m.at - replay.start) / 1000;
        return (
          <g key={m.at} className="meal">
            <line x1={x(s)} x2={x(s)} y1="18" y2="170" />
            <text x={x(s) + 4} y="28">{m.carbs} g</text>
          </g>
        );
      })}
      <path d={path} className="curve" />
    </svg>
  );
}
