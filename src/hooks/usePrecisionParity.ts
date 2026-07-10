// Precision Parity AI — live streaming reasoning across every digit market.
import { useCallback, useEffect, useRef, useState } from "react";
import { DERIV_SYMBOLS } from "./useDerivStream";
import { type Tick } from "@/lib/analytics";
import {
  analyseMarketParity,
  DEFAULT_PARITY_SETTINGS,
  type ParitySettings,
} from "@/lib/precision-parity/engine";
import type { MarketParityReport, ParityContract } from "@/lib/precision-parity/types";

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

const DIGIT_GROUPS = new Set(["Standard", "1s", "Jump"]);
export const PARITY_SYMBOLS = DERIV_SYMBOLS.filter((s) => DIGIT_GROUPS.has(s.group));

export interface HeldParitySignal {
  market: string;
  name: string;
  contract: ParityContract;
  confidence: number;
  reasoning: string[];
  createdAt: number;
  holdUntil: number;
}

export interface ParityState {
  markets: MarketParityReport[];
  best: MarketParityReport | null;
  held: HeldParitySignal | null;
  history: HeldParitySignal[];
  status: "idle" | "connecting" | "live" | "error";
  feedsReady: number;
  feedsTotal: number;
  scanning: boolean;
  lastScanAt: number;
  scanNow: () => void;
}

export function usePrecisionParity(settings: ParitySettings = DEFAULT_PARITY_SETTINGS): ParityState {
  const [state, setState] = useState<Omit<ParityState, "scanNow">>({
    markets: [],
    best: null,
    held: null,
    history: [],
    status: "idle",
    feedsReady: 0,
    feedsTotal: PARITY_SYMBOLS.length,
    scanning: false,
    lastScanAt: 0,
  });
  const ticksRef = useRef<Record<string, Tick[]>>({});
  const heldRef = useRef<HeldParitySignal | null>(null);
  const historyRef = useRef<HeldParitySignal[]>([]);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const runScan = useCallback(() => {
    const s = settingsRef.current;
    const markets: MarketParityReport[] = [];
    let ready = 0;
    for (const sym of PARITY_SYMBOLS) {
      const ticks = ticksRef.current[sym.symbol] ?? [];
      if (ticks.length >= s.minTicks) ready++;
      if (ticks.length < 60) continue;
      markets.push(analyseMarketParity(sym.symbol, sym.name, ticks, s));
    }
    // Pick READY signals only.
    const readyMarkets = markets.filter((m) => m.verdict.state === "READY" && m.verdict.recommendation !== "NO_TRADE");
    readyMarkets.sort((a, b) => b.verdict.confidence - a.verdict.confidence);
    const now = Date.now();
    let held = heldRef.current;
    const top = readyMarkets[0];
    if (held && now >= held.holdUntil) held = null;
    if (!held && top) {
      held = {
        market: top.market,
        name: top.name,
        contract: top.verdict.recommendation as ParityContract,
        confidence: top.verdict.confidence,
        reasoning: top.verdict.reasons,
        createdAt: now,
        holdUntil: now + s.minHoldSeconds * 1000,
      };
      historyRef.current = [held, ...historyRef.current].slice(0, 25);
    } else if (held && top && top.market === held.market) {
      held = { ...held, confidence: top.verdict.confidence, reasoning: top.verdict.reasons };
    }
    heldRef.current = held;
    const best = readyMarkets[0] ?? markets.sort((a, b) => b.verdict.confidence - a.verdict.confidence)[0] ?? null;
    setState((prev) => ({
      ...prev,
      markets,
      best,
      held,
      history: historyRef.current,
      feedsReady: ready,
      lastScanAt: now,
      scanning: true,
    }));
    window.setTimeout(() => setState((p) => ({ ...p, scanning: false })), 500);
  }, []);

  useEffect(() => {
    setState((p) => ({ ...p, status: "connecting" }));
    ticksRef.current = {};
    let ws: WebSocket;
    try { ws = new WebSocket(WS_URL); } catch { setState((p) => ({ ...p, status: "error" })); return; }
    ws.onopen = () => {
      setState((p) => ({ ...p, status: "live" }));
      for (const sym of PARITY_SYMBOLS) {
        ws.send(JSON.stringify({
          ticks_history: sym.symbol,
          adjust_start_time: 1,
          count: 1000,
          end: "latest",
          style: "ticks",
          subscribe: 1,
        }));
      }
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.error) return;
      if (msg.msg_type === "history" && msg.history && msg.echo_req?.ticks_history) {
        const sym = msg.echo_req.ticks_history as string;
        const { prices, times } = msg.history as { prices: number[]; times: number[] };
        ticksRef.current[sym] = prices.map((p, i) => ({ t: times[i] * 1000, price: Number(p) }));
      } else if (msg.msg_type === "tick" && msg.tick) {
        const sym = msg.tick.symbol as string;
        const arr = ticksRef.current[sym] ?? [];
        arr.push({ t: msg.tick.epoch * 1000, price: Number(msg.tick.quote) });
        if (arr.length > 2000) arr.splice(0, arr.length - 2000);
        ticksRef.current[sym] = arr;
      }
    };
    ws.onerror = () => setState((p) => ({ ...p, status: "error" }));
    ws.onclose = () => setState((p) => (p.status === "error" ? p : { ...p, status: "idle" }));
    return () => { try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ forget_all: "ticks" })); ws.close(); } catch {} };
  }, []);

  useEffect(() => {
    if (!settings.autoScan) return;
    const id = window.setInterval(runScan, Math.max(500, settings.refreshMs));
    const kick = window.setTimeout(runScan, 1200);
    return () => { window.clearInterval(id); window.clearTimeout(kick); };
  }, [runScan, settings.autoScan, settings.refreshMs]);

  return { ...state, scanNow: runScan };
}