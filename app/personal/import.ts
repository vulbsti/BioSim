/** Reads a dropped or chosen file in the browser, works out what it is, and parses it. Nothing leaves the device. */
import { AppleHealthReader, parseBandCsv, parseOura } from "./band";
import { detectCgm, parseCgm } from "./cgm";
import type { Imported } from "./data";
import { parseFhir, parsePanelText } from "./panel";

export async function importFile(file: File): Promise<Imported> {
  const name = file.name;
  if (/\.zip$/i.test(name))
    return { source: name, series: [], intervals: [], labs: [], warnings: ["Unzip the Apple Health export first and choose export.xml inside it."] };
  // Apple Health's export.xml can be hundreds of megabytes, so it is read as a stream.
  const head = await file.slice(0, 4096).text();
  if (/<HealthData|HKQuantityTypeIdentifier|HKCategoryTypeIdentifier/.test(head)) {
    const reader = new AppleHealthReader(name);
    const stream = file.stream().pipeThrough(new TextDecoderStream());
    const r = stream.getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      reader.push(value);
    }
    return reader.finish();
  }
  const text = await file.text();
  return parseText(text, name);
}

/** The same detection for text already in hand (a paste, or a file read whole). */
export function parseText(text: string, source: string): Imported {
  const t = text.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) {
    if (/"resourceType"/.test(t)) return parseFhir(text, source);
    return parseOura(text, source);
  }
  if (t.startsWith("<")) {
    const r = new AppleHealthReader(source);
    r.push(text);
    return r.finish();
  }
  if (detectCgm(text)) return parseCgm(text, source);
  const header = t.split(/\r?\n/, 1)[0];
  if (/,/.test(header) && /time|date/i.test(header)) return parseBandCsv(text, source);
  return parsePanelText(text, source);
}
