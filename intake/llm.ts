/**
 * The model's part of the intake: reading what the parsers cannot. It never decides a number on its
 * own; it copies values and units off the page (or names the columns of an unfamiliar CSV), and the
 * deterministic code in app/personal converts, checks and keeps them.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { SERIES, type SeriesKind } from "../app/personal/data";

export const MODEL = "claude-opus-5-5";

/** One line of a report, as written on it. */
export type ReportLine = { name: string; value: number; unit: string; flag: string; date: string };
export type ReportReading = { isBloodTest: boolean; collected: string; results: ReportLine[]; notes: string };
export type ColumnMap = {
  time: string;
  dateOrder: "dmy" | "mdy" | "iso";
  columns: { header: string; kind: SeriesKind | "sleepStage" | "ignore"; unit: string }[];
};
/** What the intake needs from a model. The server passes the Claude one; tests pass a stand-in. */
export interface Reader {
  readReport(input: { kind: "pdf" | "image"; mediaType: string; base64: string } | { kind: "text"; text: string }): Promise<ReportReading>;
  mapColumns(header: string[], rows: string[][]): Promise<ColumnMap>;
}

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isBloodTest", "collected", "results", "notes"],
  properties: {
    isBloodTest: { type: "boolean", description: "True if this is a laboratory blood (or urine) test report." },
    collected: { type: "string", description: "Date the sample was collected as YYYY-MM-DD (with THH:MM if shown), or empty." },
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "value", "unit", "flag", "date"],
        properties: {
          name: { type: "string", description: "Test name exactly as printed." },
          value: { type: "number", description: "The numeric result. For '<5' or '>90' give the number." },
          unit: { type: "string", description: "Unit exactly as printed, or empty." },
          flag: { type: "string", description: "H, L or empty, as printed." },
          date: { type: "string", description: "Collection date for this result if it differs from the report's, else empty." },
        },
      },
    },
    notes: { type: "string", description: "Anything that made reading uncertain (blurred values, missing units). Empty if none." },
  },
};

const KINDS = [...(Object.keys(SERIES) as SeriesKind[]), "sleepStage", "ignore"];
const COLUMNS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["time", "dateOrder", "columns"],
  properties: {
    time: { type: "string", description: "Header of the column holding the date and time of each row." },
    dateOrder: { type: "string", enum: ["dmy", "mdy", "iso"] },
    columns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["header", "kind", "unit"],
        properties: {
          header: { type: "string" },
          kind: { type: "string", enum: KINDS, description: "What the column measures; ignore for anything else." },
          unit: { type: "string", description: "Unit of the values, e.g. mg/dL or mmol/L for glucose; empty if unknown." },
        },
      },
    },
  },
};

export class ClaudeReader implements Reader {
  constructor(private client = new Anthropic()) {}

  private async ask<T>(content: Anthropic.Beta.BetaContentBlockParam[], schema: Record<string, unknown>): Promise<T> {
    const response = await this.client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") throw new Error("The model declined to read this file.");
    if (response.stop_reason === "max_tokens") throw new Error("The file was too long to read in one go.");
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    if (!text) throw new Error("The model returned no answer.");
    return JSON.parse(text) as T;
  }

  readReport(input: Parameters<Reader["readReport"]>[0]) {
    const prompt =
      "This file was uploaded by a person to see what their measurements mean for their body. If it is a laboratory " +
      "report, list every result: the test name, value and unit exactly as printed, and the H/L flag. Copy, do not " +
      "convert units or correct values. If a value is unreadable, leave it out and say so in notes. If it is not a " +
      "lab report, set isBloodTest to false and return no results.";
    const file: Anthropic.Beta.BetaContentBlockParam[] =
      input.kind === "text"
        ? [{ type: "text", text: `<file>\n${input.text}\n</file>` }]
        : input.kind === "pdf"
          ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } }]
          : [{ type: "image", source: { type: "base64", media_type: input.mediaType as "image/png", data: input.base64 } }];
    return this.ask<ReportReading>([...file, { type: "text", text: prompt }], REPORT_SCHEMA);
  }

  mapColumns(header: string[], rows: string[][]) {
    const sample = [header, ...rows.slice(0, 12)].map((r) => r.join(",")).join("\n");
    const prompt =
      "This is the start of a CSV exported from a health device or app. Say which column holds the time of each row, " +
      "how its dates are written, and what each other column measures, using only these kinds: " +
      `${KINDS.join(", ")}. Glucose is glucose; hrvRmssd and hrvSdnn are heart rate variability by method (if the ` +
      "method is not named, it is hrvRmssd); sleepStage is a column of sleep stage words. Use ignore for anything else.";
    return this.ask<ColumnMap>([{ type: "text", text: `<csv>\n${sample}\n</csv>` }, { type: "text", text: prompt }], COLUMNS_SCHEMA);
  }
}

/** A Claude reader when credentials are configured, else null (the intake then runs the parsers only). */
export function defaultReader(): Reader | null {
  if (process.env.INTAKE_LLM === "off") return null;
  // The SDK also finds a profile saved by `ant auth login`.
  const profile = existsSync(`${homedir()}/.config/anthropic`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE && !profile) return null;
  return new ClaudeReader();
}
