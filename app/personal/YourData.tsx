import { useRef, useState } from "react";
import { ClipboardList, Upload } from "lucide-react";
import { days, merge, type PersonalData } from "./data";
import { importFile, parseText } from "./import";
import { personalBaseline } from "./baseline";
import { dayReplay, type DayReplay } from "./day";

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
    [day, setDay] = useState<number | null>(null);
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
  const glucoseDays = days(data, "glucose", 5 * 60_000).filter((d) => d.coverage > 0.3);
  // The latest well-covered day, unless one was picked.
  const chosen = day ?? [...glucoseDays].reverse().find((d) => d.coverage > 0.8)?.day ?? glucoseDays.at(-1)?.day ?? null;
  const baseline = personalBaseline(data);
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
      {glucoseDays.length > 0 && chosen !== null && (
        <div className="bio-row">
          <select aria-label="Day to replay" value={chosen} onChange={(e) => setDay(Number(e.target.value))}>
            {glucoseDays.map((d) => (
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
