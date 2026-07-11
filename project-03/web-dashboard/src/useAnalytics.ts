// SSE hook: otvara /api/stream, prima inicijalni snapshot i inkrementalne update-ove.

import { useEffect, useState } from "react";
import type { Snapshot } from "./types";

const EMPTY: Snapshot = {
  readings: [],
  windows: [],
  events: [],
  predictions: [],
  alerts: [],
  ml: { correct: 0, total: 0, accuracy: 0 },
};

function cap<T>(arr: T[], item: T, n: number): T[] {
  const a = [...arr, item];
  return a.length > n ? a.slice(a.length - n) : a;
}

interface UpdateMsg {
  kind: "reading" | "window" | "event" | "prediction" | "alert";
  item: any;
  mlAccuracy?: number;
}

function applyUpdate(prev: Snapshot, msg: UpdateMsg): Snapshot {
  switch (msg.kind) {
    case "reading":
      return { ...prev, readings: cap(prev.readings, msg.item, 120) };
    case "window":
      return { ...prev, windows: cap(prev.windows, msg.item, 30) };
    case "event":
      return { ...prev, events: cap(prev.events, msg.item, 30) };
    case "prediction": {
      const total = prev.ml.total + 1;
      const correct = prev.ml.correct + (msg.item.correct ? 1 : 0);
      return {
        ...prev,
        predictions: cap(prev.predictions, msg.item, 30),
        ml: { correct, total, accuracy: msg.mlAccuracy ?? (total ? correct / total : 0) },
      };
    }
    case "alert":
      return { ...prev, alerts: cap(prev.alerts, msg.item, 30) };
    default:
      return prev;
  }
}

export function useAnalytics() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.addEventListener("snapshot", (e) => {
      setData(JSON.parse((e as MessageEvent).data));
      setConnected(true);
    });
    es.addEventListener("update", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as UpdateMsg;
      setData((prev) => applyUpdate(prev, msg));
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  return { data, connected };
}
