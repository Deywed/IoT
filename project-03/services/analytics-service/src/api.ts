// ── HTTP + SSE API za web dashboard ──────────────────────────────────────────
// Analytics izlaže lagani REST + Server-Sent Events sloj koji web dashboard
// koristi da prikaže: živa merenja, statistiku prozora, eKuiper CEP događaje,
// MaaS ML predikcije i alarme. nginx u web servisu reverse-proxy-uje /api ovamo.

import express from "express";
import { store } from "./state";

export function startApiServer(port: number): void {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Inicijalni snapshot (dashboard ga učita pri otvaranju).
  app.get("/api/summary", (_req, res) => {
    res.json(store.snapshot());
  });

  // Live tok: pri konekciji šalje snapshot, pa gura svaki "update" sa bus-a.
  app.get("/api/stream", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: ne baferuj SSE
    });
    res.flushHeaders();

    res.write(`event: snapshot\ndata: ${JSON.stringify(store.snapshot())}\n\n`);

    const onUpdate = (msg: unknown) => {
      res.write(`event: update\ndata: ${JSON.stringify(msg)}\n\n`);
    };
    store.bus.on("update", onUpdate);

    const keepAlive = setInterval(() => res.write(`: keep-alive\n\n`), 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      store.bus.off("update", onUpdate);
    });
  });

  app.listen(port, () => console.log(`[Analytics] HTTP/SSE API sluša na :${port}`));
}
