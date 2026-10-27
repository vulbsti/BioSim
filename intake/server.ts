/**
 * The data intake backend: takes uploaded files, reads them (parsers first, the model for what they
 * cannot), keeps what came out, and hands the combined data, personal baseline and day replays to
 * whoever asks. Independent of the body app for now; the intake page talks to it through /api.
 *
 *   npx tsx intake/server.ts            (port 3020, files kept in work/intake/)
 *   ANTHROPIC_API_KEY=... to let it read PDFs, photos and unfamiliar files; INTAKE_LLM=off to stop it.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { personalBaseline } from "../app/personal/baseline";
import { days, emptyData, merge, type PersonalData } from "../app/personal/data";
import { dayReplay } from "../app/personal/day";
import { defaultReader, MODEL, type Reader } from "./llm";
import { labLines, processUpload, type Processed } from "./process";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MAX = 512 * 1024 * 1024;

export function intakeServer({ dir = `${ROOT}work/intake`, reader = defaultReader() }: { dir?: string; reader?: Reader | null } = {}) {
  const records = new Map<string, Processed>();
  const ready = (async () => {
    await mkdir(dir, { recursive: true });
    for (const f of await readdir(dir))
      if (f.endsWith(".json")) {
        const r = JSON.parse(await readFile(`${dir}/${f}`, "utf8")) as Processed;
        records.set(r.id, r);
      }
  })();
  const combined = (): PersonalData => [...records.values()].reduce((a, r) => merge(a, r.data), emptyData());
  const summary = (r: Processed) => ({ id: r.id, name: r.name, size: r.size, receivedAt: r.receivedAt, kind: r.kind, steps: r.steps, warnings: r.warnings, labs: labLines(r.data), unused: r.unused });

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const read = (req: IncomingMessage) =>
    new Promise<Buffer>((done, fail) => {
      const parts: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX) (fail(new Error("The file is over 512 MB.")), req.destroy());
        else parts.push(c);
      });
      req.on("end", () => done(Buffer.concat(parts)));
      req.on("error", fail);
    });

  return createServer(async (req, res) => {
    try {
      await ready;
      const url = new URL(req.url ?? "/", "http://intake");
      const [, api, what, id] = url.pathname.split("/");
      if (api !== "api") return json(res, 404, { error: "Not found." });
      if (what === "status" && req.method === "GET") return json(res, 200, { model: reader ? MODEL : null, files: records.size });
      if (what === "uploads" && req.method === "POST" && !id) {
        const name = decodeURIComponent(String(req.headers["x-filename"] ?? "upload"));
        const record = await processUpload(name, await read(req), reader);
        records.set(record.id, record);
        await writeFile(`${dir}/${record.id}.json`, JSON.stringify(record));
        return json(res, 201, summary(record));
      }
      if (what === "uploads" && req.method === "GET" && !id)
        return json(res, 200, [...records.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map(summary));
      if (what === "uploads" && id && records.has(id)) {
        if (req.method === "GET") return json(res, 200, records.get(id));
        if (req.method === "DELETE") {
          records.delete(id);
          await rm(`${dir}/${id}.json`, { force: true });
          return json(res, 200, { deleted: id });
        }
      }
      // Everything uploaded so far, as one person's data, with what it means for the body model.
      if (what === "personal" && req.method === "GET") {
        const data = combined();
        return json(res, 200, { data, baseline: personalBaseline(data), days: days(data, "glucose", 5 * 60_000) });
      }
      // One measured day as a run of the body model: events, measured curves and the meals found.
      if (what === "replay" && req.method === "GET") {
        const data = combined(),
          day = Number(url.searchParams.get("day"));
        if (!Number.isFinite(day)) return json(res, 400, { error: "Give ?day= as milliseconds of the wall-clock date." });
        return json(res, 200, dayReplay(data, day, { insulinSensitivity: personalBaseline(data).params.insulinSensitivity }));
      }
      return json(res, 404, { error: "Not found." });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3020);
  const reader = defaultReader();
  intakeServer({ reader }).listen(port, () =>
    console.log(`Data intake on http://localhost:${port}/api (model: ${reader ? MODEL : "off, parsers only"})`),
  );
}
