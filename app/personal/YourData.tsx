import { useEffect, useRef, useState } from "react";
import { ClipboardList, Upload } from "lucide-react";
import { days, merge, type PersonalData } from "./data";
import { importFile, parseText } from "./import";
import { personalBaseline } from "./baseline";
import { dayReplay, type DayReplay } from "./day";
import { unpack, type PersonFile, type PersonSummary } from "./people";

const PEOPLE = "/samples/people/";

const dayName = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Bring your own measurements: files from a CGM or band, or results pasted from a blood test. */
export default function YourData({
  data,
  onData,
  onReplay,
}: {
  data: PersonalData;
  onData: (d: PersonalData) => void;
  onReplay: (r: DayReplay) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [warnings, setWarnings] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [pasting, setPasting] = useState(false),
    [paste, setPaste] = useState(""),
    [day, setDay] = useState<number | null>(null),
    [people, setPeople] = useState<PersonSummary[]>([]),
    [sample, setSample] = useState<PersonSummary | null>(null);
  useEffect(() => {
    fetch(`${PEOPLE}index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);
  /** A real person's published data replaces whatever is loaded. */
  const pick = async (id: string) => {
    const s = people.find((p) => p.id === id) ?? null;
    setDay(null);
    setWarnings([]);
    setSample(s);
    if (!s) return onData({ series: [], intervals: [], labs: [] });
    setBusy(true);
    try {
      onData(unpack((await (await fetch(`${PEOPLE}${s.id}.json`)).json()) as PersonFile));
    } catch {
      setWarnings([`${s.name} could not be loaded.`]);
    }
    setBusy(false);
  };
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let next = data;
    const notes: string[] = [];
    for (const f of [...files]) {
      try {
        const r = await importFile(f);
        next = merge(next, r);
        notes.push(...r.warnings.map((w) => `${f.name}: ${w}`));
      } catch (e) {
        notes.push(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    setBusy(false);
    setWarnings(notes);
    onData(next);
  };
  const addPaste = () => {
    const r = parseText(paste, "Blood test");
    setWarnings(r.warnings);
    onData(merge(data, r));
    if (r.labs.length) (setPaste(""), setPasting(false));
  };
  // Days to replay: glucose days, or for a band alone the days its heart rate covers.
  const glucoseDays = days(data, "glucose", 5 * 60_000).filter((d) => d.coverage > 0.3);
  const replayDays = glucoseDays.length ? glucoseDays : days(data, "heartRate", 5 * 60_000).filter((d) => d.coverage > 0.3);
  // The latest well-covered day, unless one was picked.
  const chosen = day ?? [...replayDays].reverse().find((d) => d.coverage > 0.8)?.day ?? replayDays.at(-1)?.day ?? null;
  const baseline = personalBaseline(data, sample?.profile);
  const kinds = new Set(data.series.map((s) => s.kind));
  const band = [
    kinds.has("heartRate") || kinds.has("restingHeartRate") ? "heart rate" : "",
    kinds.has("hrvRmssd") || kinds.has("hrvSdnn") ? "HRV" : "",
    kinds.has("steps") ? "steps" : "",
    kinds.has("spo2") ? "blood oxygen" : "",
    kinds.has("respiratoryRate") ? "breathing" : "",
    data.intervals.some((i) => i.kind === "sleep") ? "sleep" : "",
    data.intervals.some((i) => i.kind === "workout") ? "workouts" : "",
  ].filter(Boolean);
  const have = [
    ...(kinds.has("glucose") ? [`Glucose sensor: ${glucoseDays.length} day${glucoseDays.length === 1 ? "" : "s"} to replay`] : []),
    ...(band.length ? [`Band: ${band.join(", ")}`] : []),
    ...(data.labs.length ? [`Blood test: ${data.labs.length} result${data.labs.length === 1 ? "" : "s"}`] : []),
  ];
  return (
    <>
      <h3>Your data</h3>
      {people.length > 0 && (
        <div className="bio-row">
          <select aria-label="Sample person" value={sample?.id ?? ""} disabled={busy} onChange={(e) => pick(e.target.value)}>
            <option value="">Try a real person's published data…</option>
            {[...new Set(people.map((p) => p.group))].map((g) => (
              <optgroup key={g} label={g}>
                {people
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      {sample && (
        <p className="bio-note bio-credit">
          {sample.about}{" "}
          <a href={sample.credit.url} target="_blank" rel="noreferrer">
            {sample.credit.dataset}
          </a>
          , {sample.credit.licence}.
        </p>
      )}
      <div className="bio-row">
        <button className="bio-primary" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={14} /> {busy ? "Reading…" : "Add a file"}
        </button>
        <button className="bio-secondary" aria-pressed={pasting} onClick={() => setPasting((v) => !v)}>
          <ClipboardList size={14} /> Blood test
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Choose data files"
          accept=".csv,.txt,.xml,.json,.zip"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {pasting && (
        <div className="bio-paste">
          <textarea
            aria-label="Blood test results"
            rows={5}
            placeholder={"One result per line, as on the report:\nHbA1c 39 mmol/mol\nGlucose, fasting 5.4 mmol/L\nInsulin 84 pmol/L"}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button className="bio-secondary" disabled={!paste.trim()} onClick={addPaste}>
            Add results
          </button>
        </div>
      )}
      {!have.length ? (
        <p className="bio-note">
          A glucose sensor export (Libre, Dexcom), Apple Health or Oura export, or your blood test results. Read here on
          this device; nothing is uploaded.
        </p>
      ) : (
        <ul className="bio-have">
          {have.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {warnings.map((w) => (
        <p key={w} className="bio-note bio-warn">
          {w}
        </p>
      ))}
      {replayDays.length > 0 && chosen !== null && (
        <div className="bio-row">
          <select aria-label="Day to replay" value={chosen} onChange={(e) => setDay(Number(e.target.value))}>
            {replayDays.map((d) => (
              <option key={d.day} value={d.day}>
                {dayName(d.day)}
              </option>
            ))}
          </select>
          <button
            className="bio-primary"
            onClick={() => onReplay(dayReplay(data, chosen, { insulinSensitivity: baseline.params.insulinSensitivity }))}
          >
            Replay this day
          </button>
        </div>
      )}
    </>
  );
}
