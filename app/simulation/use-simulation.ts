import { useCallback, useEffect, useRef, useState } from "react";
import { createBody } from "./engine";
import type { BodyState } from "./types";

export function useSimulation() {
  const worker = useRef<Worker | null>(null);
  const [data, setData] = useState<{
    state: BodyState;
    running: boolean;
    speed: number;
    /** Moments of this run that can be shown again, the present time, and the moment shown (null: the present). */
    timeline: { times: number[]; now: number; viewing: number | null };
    error?: string;
  }>({ state: createBody(), running: false, speed: 120, timeline: { times: [0], now: 0, viewing: null } });
  useEffect(() => {
    const w = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e) => setData(e.data);
    w.onerror = () =>
      setData((d) => ({
        ...d,
        running: false,
        error: "The simulation worker stopped unexpectedly. Reset or reload to restart.",
      }));
    w.postMessage({ type: "init" });
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);
  const send = useCallback(
    (message: Record<string, unknown>) => worker.current?.postMessage(message),
    [],
  );
  return { ...data, send };
}
