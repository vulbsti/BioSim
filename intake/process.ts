/**
 * What happens to one uploaded file: work out what it is, read it with the parsers in app/personal,
 * and only when they cannot (a PDF or photo of a report, free text, an unfamiliar CSV) ask the model.
 * Every step is recorded so the page can show how each number got in.
 */
import { AppleHealthReader, parseBandCsv } from "../app/personal/band";
import { parseCgm } from "../app/personal/cgm";
import { SERIES, csvLine, emptyData, lines, merge, parseTime, type Imported, type PersonalData } from "../app/personal/data";
import { parseText } from "../app/personal/import";
import { ANALYTES, analyteFor, labResult, type AnalyteId } from "../app/personal/panel";
import { MODEL, type Reader, type ReportReading } from "./llm";

export type Step = { step: string; detail: string };
export type Processed = {
  id: string;
  name: string;
  size: number;
  receivedAt: string;
  kind: "glucose sensor" | "band" | "blood test" | "mixed" | "nothing found";
  steps: Step[];
  data: PersonalData;
  /** Lines the model read that no known test matches; kept to show, not used by the body model. */
  unused: { name: string; value: number; unit: string }[];
  warnings: string[];
};

const magic = (b: Buffer) =>
  b.subarray(0, 5).toString("latin1") === "%PDF-"
    ? "application/pdf"
    : b[0] === 0x89 && b[1] === 0x50
      ? "image/png"
      : b[0] === 0xff && b[1] === 0xd8
        ? "image/jpeg"
        : b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"
          ? "image/webp"
          : null;

function kindOf(d: PersonalData): Processed["kind"] {
  const kinds = [
    d.series.some((s) => s.kind === "glucose") && "glucose sensor",
    (d.series.some((s) => s.kind !== "glucose") || d.intervals.some((i) => i.kind !== "meal")) && "band",
    d.labs.length > 0 && "blood test",
  ].filter(Boolean) as Processed["kind"][];
  return kinds.length === 0 ? "nothing found" : kinds.length === 1 ? kinds[0] : "mixed";
}
const found = (r: Imported) => r.series.length + r.intervals.length + r.labs.length > 0;
const counts = (d: PersonalData) =>
  [
    ...d.series.map((s) => `${s.points.length} ${SERIES[s.kind].name.toLowerCase()} readings`),
    d.intervals.length ? `${d.intervals.length} sleep, workout or meal intervals` : "",
    d.labs.length ? `${d.labs.length} blood test results` : "",
  ]
    .filter(Boolean)
    .join(", ");

/** Turns what the model copied off a report into checked results, through the same unit table as typing them. */
export function fromReport(reading: ReportReading, source: string): { imported: Imported; unused: Processed["unused"] } {
  const labs = [],
    warnings: string[] = [],
    unused: Processed["unused"] = [];
  const collected = parseTime(reading.collected || "");
  for (const line of reading.results) {
    const id = analyteFor(line.name);
    if (!id) {
      unused.push({ name: line.name, value: line.value, unit: line.unit });
      continue;
    }
    const at = parseTime(line.date || "");
    const { result, warning } = labResult(id, line.value, line.unit, source, Number.isFinite(at) ? at : Number.isFinite(collected) ? collected : undefined);
    if (result) labs.push(result);
    if (warning) warnings.push(warning);
  }
  if (reading.notes) warnings.push(`While reading: ${reading.notes}`);
  return { imported: { source, series: [], intervals: [], labs, warnings }, unused };
}

/** Rewrites an unfamiliar CSV under the column names the band and glucose parsers know, using the model's map. */
async function remap(text: string, source: string, reader: Reader, steps: Step[]): Promise<Imported | null> {
  const rows = lines(text).map((l) => csvLine(l, l.split(";").length > l.split(",").length ? ";" : ","));
  if (rows.length < 2 || rows[0].length < 2) return null;
  const map = await reader.mapColumns(rows[0], rows.slice(1));
  const t = rows[0].indexOf(map.time);
  const used = map.columns.filter((c) => c.kind !== "ignore" && rows[0].includes(c.header));
  steps.push({ step: "model", detail: `${MODEL} named the columns: ${[`${map.time} = time`, ...used.map((c) => `${c.header} = ${c.kind}${c.unit ? ` (${c.unit})` : ""}`)].join(", ")}` });
  if (t < 0 || !used.length) return null;
  const NAME: Record<string, string> = {
    heartRate: "heart_rate", restingHeartRate: "resting heart rate", hrvRmssd: "hrv_rmssd", hrvSdnn: "sdnn",
    steps: "steps", spo2: "spo2", respiratoryRate: "respiratory rate", sleepStage: "sleep_stage",
  };
  // ISO dates need no hint; day-first dates are rewritten month first so the parsers read them the same way.
  const time = (s: string) => (map.dateOrder === "dmy" ? s.replace(/^(\d{1,2})([-/.])(\d{1,2})\2/, "$3$2$1$2") : s);
  const csv = (cols: typeof used, names: string[]) =>
    [["time", ...names], ...rows.slice(1).map((r) => [time(r[t]), ...cols.map((c) => r[rows[0].indexOf(c.header)] ?? "")])]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
  // Glucose goes through the glucose parser, everything else through the band parser.
  const glucose = used.find((c) => c.kind === "glucose"),
    rest = used.filter((c) => c.kind !== "glucose");
  const parts: Imported[] = [];
  if (glucose) parts.push(parseCgm(csv([glucose], [`glucose ${/mmol/i.test(glucose.unit) ? "mmol/L" : "mg/dL"}`]), source));
  if (rest.length) parts.push(parseBandCsv(csv(rest, rest.map((c) => NAME[c.kind])), source));
  return parts.reduce<Imported>((a, b) => ({ ...merge(a, b), source, warnings: [...a.warnings, ...b.warnings] }), { ...emptyData(), source, warnings: [] });
}

export async function processUpload(name: string, body: Buffer, reader: Reader | null, id = crypto.randomUUID()): Promise<Processed> {
  const steps: Step[] = [],
    warnings: string[] = [];
  let data = emptyData(),
    unused: Processed["unused"] = [];
  const add = (r: Imported) => {
    data = merge(data, r);
    warnings.push(...r.warnings.filter((w) => !/^No (known|glucose|heart|Oura)/.test(w)));
  };
  const media = magic(body);
  const noModel = "No model is set up (ANTHROPIC_API_KEY), so this file could not be read. Parsers handle CSV, XML, JSON and pasted text.";
  try {
    if (media) {
      steps.push({ step: "detect", detail: media === "application/pdf" ? "A PDF" : "A picture" });
      if (!reader) warnings.push(noModel);
      else {
        const reading = await reader.readReport({ kind: media === "application/pdf" ? "pdf" : "image", mediaType: media, base64: body.toString("base64") });
        steps.push({ step: "model", detail: `${MODEL} read ${reading.results.length} results off the ${media === "application/pdf" ? "PDF" : "picture"}${reading.isBloodTest ? "" : " (not a lab report)"}` });
        const r = fromReport(reading, name);
        add(r.imported);
        unused = r.unused;
      }
    } else {
      const text = body.toString("utf8");
      let r: Imported;
      if (/<HealthData|HKQuantityTypeIdentifier/.test(text.slice(0, 4096))) {
        // Fed in pieces, as a very large export would be.
        const apple = new AppleHealthReader(name);
        for (let i = 0; i < text.length; i += 1 << 20) apple.push(text.slice(i, i + (1 << 20)));
        r = apple.finish();
        steps.push({ step: "parser", detail: "Apple Health export" });
      } else {
        r = parseText(text, name);
        steps.push({ step: "parser", detail: found(r) ? "Read by the built-in parsers" : "The built-in parsers found nothing they know" });
      }
      if (found(r)) add(r);
      else if (!reader) warnings.push(noModel);
      else {
        const csvLike = lines(text).slice(0, 3).every((l) => l.split(/[,;]/).length > 1);
        const mapped = csvLike ? await remap(text, name, reader, steps) : null;
        if (mapped && found(mapped)) add(mapped);
        else {
          const reading = await reader.readReport({ kind: "text", text: text.slice(0, 200_000) });
          steps.push({ step: "model", detail: `${MODEL} read ${reading.results.length} results from the text` });
          const fr = fromReport(reading, name);
          add(fr.imported);
          unused = fr.unused;
        }
      }
    }
  } catch (e) {
    warnings.push(`Could not finish reading: ${e instanceof Error ? e.message : String(e)}`);
  }
  steps.push({ step: "result", detail: counts(data) || "Nothing usable" });
  if (unused.length) warnings.push(`Not used yet (no part of the body model needs them): ${unused.map((u) => u.name).join(", ")}`);
  return { id, name, size: body.length, receivedAt: new Date().toISOString(), kind: kindOf(data), steps, data, unused, warnings };
}

/** One line per blood test result for the page: as written, and what it became. */
export const labLines = (d: PersonalData) =>
  d.labs.map((l) => ({ name: ANALYTES[l.analyte as AnalyteId]?.name ?? l.analyte, entered: l.entered, value: l.value, unit: ANALYTES[l.analyte as AnalyteId]?.unit ?? "" }));
