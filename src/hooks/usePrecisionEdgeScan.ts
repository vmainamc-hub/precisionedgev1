// Precision Edge AI — multi-market intelligence scanner.
// Streams live Deriv ticks for every digit-tradable market, runs one
// PrecisionEdgeEngine per market, and continuously ranks opportunities.
import { useCallback, useEffect, useRef, useState } from "react";
import { DERIV_SYMBOLS } from "./useDerivStream";
import { lastDigit } from "@/lib/analytics";
import { PrecisionEdgeEngine } from "@/lib/precision-edge/orchestrator";
import type { EngineOutput, Tick } from "@/lib/precision-edge/types";
import {
  DEFAULT_TERMINAL_CONFIG,
  toEngineWeights,
  type TerminalConfig,
} from "@/lib/precision-edge/terminal";

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const MAX_TICKS = 1200;
const REQUIRED_TICKS = 1000;

// Digit contracts (Over/Under) apply to Volatility + 1s + Jump families.
const DIGIT_GROUPS = new Set(["Standard", "1s", "Jump"]);
export const PE_SYMBOLS = DERIV_SYMBOLS.filter((s) => DIGIT_GROUPS.has(s.group));

export type MarketRow = EngineOutput & { name: string; ready: boolean; ticks: number };

export interface ScanState {
  rows: MarketRow[];
  best: MarketRow | null;
  qualifying: MarketRow[];
  status: "idle" | "connecting" | "live" | "error";
  latencyMs: number;
  feedsReady: number;
  feedsTotal: number;
  lastDigits: Record<string, number>;
  tickCounts: Record<string, number>;
  analysedCount: number;
  scanning: boolean;
  lastScanAt: number;
  scanNow: () => void;
}

export function usePrecisionEdgeScan(config: TerminalConfig): ScanState {
  const [state, setState] = useState<Omit<ScanState, "scanNow">>({
    rows: [],
    best: null,
    qualifying: [],
    status: "idle",
    latencyMs: 0,
    feedsReady: 0,
    feedsTotal: PE_SYMBOLS.length,
    lastDigits: {},
    tickCounts: {},
    analysedCount: 0,
    scanning: false,
    lastScanAt: 0,
  });

  const ticksRef = useRef<Record<string, Tick[]>>({});
  const enginesRef = useRef<Record<string, PrecisionEdgeEngine>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const pingSentRef = useRef<number>(0);
  const latencyRef = useRef<number>(0);
  const bestKeyRef = useRef<string | null>(null);
  const bestEdgeRef = useRef<number>(0);
  const configRef = useRef<TerminalConfig>(config);

  // Keep engines' config in sync with the terminal controls.
  useEffect(() => {
    configRef.current = config;
    const weights = toEngineWeights(config);
    for (const eng of Object.values(enginesRef.current)) {
      eng.updateConfig({
        engineWeights: weights,
        recommendationThreshold: config.threshold,
      });
    }
  }, [config]);

  const runScan = useCallback(() => {
    const cfg = configRef.current;
    const rows: MarketRow[] = [];
    const lastDigits: Record<string, number> = {};
    const tickCounts: Record<string, number> = {};
    let ready = 0;

    for (const s of PE_SYMBOLS) {
      const ticks = ticksRef.current[s.symbol] ?? [];
      tickCounts[s.symbol] = ticks.length;
      if (ticks.length) lastDigits[s.symbol] = lastDigit(ticks[ticks.length - 1].price);
      const isReady = ticks.length >= REQUIRED_TICKS;
      if (isReady) ready++;
      if (ticks.length < 60) continue;
      const eng = enginesRef.current[s.symbol];
      if (!eng) continue;
      const out = eng.evaluate();
      rows.push({ ...out, name: s.name, ready: isReady, ticks: ticks.length });
    }

    rows.sort((a, b) => b.edgeScore - a.edgeScore);

    // Qualifying = ready + healthy + has a recommendation above threshold.
    const qualifying = rows.filter(
      (r) =>
        r.ready &&
        r.recommended != null &&
        r.marketHealth >= cfg.minMarketHealth &&
        r.edgeScore >= cfg.threshold,
    );

    // Hysteresis: only switch the headline pick when a challenger beats the
    // incumbent by the configured margin — avoids flip-flopping.
    let best: MarketRow | null = null;
    if (qualifying.length) {
      const top = qualifying[0];
      const incumbent = qualifying.find((r) => r.market === bestKeyRef.current) ?? null;
      if (
        incumbent &&
        top.market !== incumbent.market &&
        top.edgeScore - incumbent.edgeScore < cfg.hysteresis
      ) {
        best = incumbent;
      } else {
        best = top;
      }
      bestKeyRef.current = best.market;
      bestEdgeRef.current = best.edgeScore;
    } else {
      bestKeyRef.current = null;
      bestEdgeRef.current = 0;
    }

    setState((prev) => ({
      ...prev,
      rows,
      best,
      qualifying,
      lastDigits,
      tickCounts,
      feedsReady: ready,
      analysedCount: rows.length,
      latencyMs: latencyRef.current,
      lastScanAt: Date.now(),
      scanning: true,
    }));
    // Drop the scanning pulse shortly after.
    window.setTimeout(() => setState((p) => ({ ...p, scanning: false })), 650);
  }, []);

  // WebSocket connection + tick ingestion.
  useEffect(() => {
    setState((p) => ({ ...p, status: "connecting" }));
    ticksRef.current = {};
    enginesRef.current = {};
    const weights = toEngineWeights(configRef.current);
    for (const s of PE_SYMBOLS) {
      enginesRef.current[s.symbol] = new PrecisionEdgeEngine({
        market: s.symbol,
        config: { engineWeights: weights, recommendationThreshold: configRef.current.threshold },
      });
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setState((p) => ({ ...p, status: "error" }));
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setState((p) => ({ ...p, status: "live" }));
      for (const s of PE_SYMBOLS) {
        ws.send(
          JSON.stringify({
            ticks_history: s.symbol,
            adjust_start_time: 1,
            count: MAX_TICKS,
            end: "latest",
            style: "ticks",
            subscribe: 1,
          }),
        );
      }
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.msg_type === "ping" || msg.pong) {
        latencyRef.current = Math.max(1, Date.now() - pingSentRef.current);
        return;
      }
      if (msg.error) return;
      if (msg.msg_type === "history" && msg.history && msg.echo_req?.ticks_history) {
        const sym = msg.echo_req.ticks_history as string;
        const { prices, times } = msg.history as { prices: number[]; times: number[] };
        const arr = prices.map((p, i) => ({ t: times[i] * 1000, price: Number(p) }));
        ticksRef.current[sym] = arr;
        enginesRef.current[sym]?.seed(arr);
      } else if (msg.msg_type === "tick" && msg.tick) {
        const sym = msg.tick.symbol as string;
        const arr = ticksRef.current[sym] ?? [];
        const tk = { t: msg.tick.epoch * 1000, price: Number(msg.tick.quote) };
        arr.push(tk);
        if (arr.length > MAX_TICKS) arr.splice(0, arr.length - MAX_TICKS);
        ticksRef.current[sym] = arr;
        enginesRef.current[sym]?.push(tk);
      }
    };
    ws.onerror = () => setState((p) => ({ ...p, status: "error" }));
    ws.onclose = () => setState((p) => (p.status === "error" ? p : { ...p, status: "idle" }));

    // Latency ping every 5s.
    const pingId = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        pingSentRef.current = Date.now();
        ws.send(JSON.stringify({ ping: 1 }));
      }
    }, 5000);

    return () => {
      window.clearInterval(pingId);
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ forget_all: "ticks" }));
        ws.close();
      } catch {}
    };
  }, []);

  // Auto-scan loop.
  useEffect(() => {
    if (!config.autoScan) return;
    const id = window.setInterval(runScan, 2000);
    // Kick one immediately so the UI populates fast.
    const kick = window.setTimeout(runScan, 800);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(kick);
    };
  }, [config.autoScan, runScan]);

  return { ...state, scanNow: runScan };
}