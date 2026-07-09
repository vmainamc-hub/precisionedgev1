// Precision Edge AI V2 — live market reasoning across every digit market.
// Streams Deriv ticks and runs the independent contract intelligence engines
// per market, then ranks by internal consistency filtered through the
// operator's gates. Emits ONE signal at a time and holds it for at least
// `minHoldSeconds` so it remains actionable.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DERIV_SYMBOLS } from "./useDerivStream";
import { lastDigit, type Tick } from "@/lib/analytics";
import { analyseMarket } from "@/lib/precision-edge-v2/engine";
import type { ContractVerdict, MarketReasoning } from "@/lib/precision-edge-v2/types";
import { DEFAULT_SETTINGS, type PrecisionSettings } from "./usePrecisionSettings";

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

const DIGIT_GROUPS = new Set(["Standard", "1s", "Jump"]);
export const PE_SYMBOLS = DERIV_SYMBOLS.filter((s) => DIGIT_GROUPS.has(s.group));

export interface HeldSignal {
  market: string;
  name: string;
  verdict: ContractVerdict;
  psychology: MarketReasoning["psychology"];
  behaviour: MarketReasoning["behaviour"];
  createdAt: number;
  holdUntil: number;
}

export interface ReasoningState {
  markets: MarketReasoning[];
  best: MarketReasoning | null;
  held: HeldSignal | null;         // sticky single-signal output
  status: "idle" | "connecting" | "live" | "error";
  latencyMs: number;
  feedsReady: number;
  feedsTotal: number;
  lastDigits: Record<string, number>;
  scanning: boolean;
  lastScanAt: number;
  scanNow: () => void;
}

/** Rescale weights so they sum to 1. */
function normWeights(w: PrecisionSettings["weights"]): PrecisionSettings["weights"] {
  const sum = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const out = {} as PrecisionSettings["weights"];
  (Object.keys(w) as (keyof typeof w)[]).forEach((k) => (out[k] = Math.max(0, w[k]) / sum));
  return out;
}

/** Weighted score for a verdict using the operator's engine weights. */
function weightedScore(v: ContractVerdict, psyHealth: number, w: PrecisionSettings["weights"]) {
  const n = normWeights(w);
  // Map gates → engine weights.
  const gateBy = Object.fromEntries(v.gates.map((g) => [g.name, g.ok ? 1 : 0]));
  const persistence = Math.min(1, v.persistenceTicks / 10);
  const health = Math.max(0, Math.min(1, psyHealth / 100));
  const parts =
    n.digitStatistics * (gateBy["Edge"] ?? 0) +
    n.barMomentum * (gateBy["Momentum"] ?? 0) +
    n.contrarian * (gateBy["Loser suppression"] ?? 0) +
    n.digitZones * (gateBy["Digit compatibility"] ?? 0) +
    n.psychology * (gateBy["Trader alignment"] ?? 0) +
    n.marketHealth * ((gateBy["Manipulation"] ?? 0) * 0.5 + health * 0.5) +
    n.persistence * persistence +
    n.recoveryFit * Math.max(0, Math.min(1, (v.edge + 0.05) / 0.1)) +
    n.botCompatibility * Math.max(0, Math.min(1, v.confidence / 100));
  return parts * 100; // 0..100
}

export function usePrecisionReasoning(settings: PrecisionSettings = DEFAULT_SETTINGS): ReasoningState {
  const [state, setState] = useState<Omit<ReasoningState, "scanNow">>({
    markets: [],
    best: null,
    held: null,
    status: "idle",
    latencyMs: 0,
    feedsReady: 0,
    feedsTotal: PE_SYMBOLS.length,
    lastDigits: {},
    scanning: false,
    lastScanAt: 0,
  });

  const ticksRef = useRef<Record<string, Tick[]>>({});
  const pingSentRef = useRef<number>(0);
  const latencyRef = useRef<number>(0);
  const heldRef = useRef<HeldSignal | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const maxTicks = useMemo(() => Math.max(300, Math.min(5000, settings.lookbackTicks + 200)), [settings.lookbackTicks]);

  const runScan = useCallback(() => {
    const s = settingsRef.current;
    const markets: MarketReasoning[] = [];
    const lastDigits: Record<string, number> = {};
    let ready = 0;

    for (const sym of PE_SYMBOLS) {
      const ticks = (ticksRef.current[sym.symbol] ?? []).slice(-s.lookbackTicks);
      if (ticks.length) lastDigits[sym.symbol] = lastDigit(ticks[ticks.length - 1].price);
      if (ticks.length >= s.lookbackTicks) ready++;
      if (ticks.length < 60) continue;
      markets.push(analyseMarket(sym.symbol, sym.name, ticks));
    }

    // Gate every verdict against operator's minimums.
    type Candidate = { m: MarketReasoning; v: ContractVerdict; score: number };
    const candidates: Candidate[] = [];
    for (const m of markets) {
      for (const v of m.verdicts) {
        if (s.onlyEnabledBot && !s.enabledBots[v.id]) continue;
        if (v.confidence < s.threshold) continue;
        if (m.psychology.health < s.minMarketHealth) continue;
        if (v.persistenceTicks * 10 < s.minPersistence) continue;
        if (v.consistency < s.minStability) continue;
        if (v.state === "REJECTED" || v.state === "CONFLICT") continue;
        // Quality filter: only READY verdicts fire signals — WATCH/BUILDING
        // are exploratory and were historically responsible for losses.
        if (v.state !== "READY") continue;
        // Scanner mindset applies to ALL over/under contracts as a soft gate.
        // A verdict may only fire when the mindset gate is present AND ok
        // (≥5/7 sub-conditions aligned). Missing mindset gate = non-family
        // contract, which is fine.
        const mindGate = v.gates.find((g) => g.name === "Scanner mindset");
        if (mindGate && !mindGate.ok) continue;
        // Bot compatibility ≈ confidence gate above minBotCompatibility.
        if (v.confidence < s.minBotCompatibility) continue;
        const score = weightedScore(v, m.psychology.health, s.weights);
        candidates.push({ m, v, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    const top = candidates[0] ?? null;
    const now = Date.now();
    let held = heldRef.current;

    if (held && now < held.holdUntil) {
      // Sticky hold: only switch if a challenger clearly beats the incumbent.
      const heldStill = candidates.find((c) => c.m.market === held!.market && c.v.id === held!.verdict.id);
      if (heldStill) {
        held = { ...held, verdict: heldStill.v, psychology: heldStill.m.psychology, behaviour: heldStill.m.behaviour };
      } else if (top) {
        const heldScore = heldStill ? (heldStill as Candidate).score : 0;
        if (top.score - heldScore < s.hysteresis) {
          // keep held signal even though it no longer qualifies — reasoning may be transient
        } else {
          held = null;
        }
      }
    } else {
      held = null;
    }

    if (!held && top) {
      held = {
        market: top.m.market,
        name: top.m.name,
        verdict: top.v,
        psychology: top.m.psychology,
        behaviour: top.m.behaviour,
        createdAt: now,
        holdUntil: now + s.minHoldSeconds * 1000,
      };
    }
    heldRef.current = held;

    const best = top ? top.m : null;

    setState((prev) => ({
      ...prev,
      markets,
      best,
      held,
      lastDigits,
      feedsReady: ready,
      latencyMs: latencyRef.current,
      lastScanAt: now,
      scanning: true,
    }));
    window.setTimeout(() => setState((p) => ({ ...p, scanning: false })), 650);
  }, []);

  useEffect(() => {
    setState((p) => ({ ...p, status: "connecting" }));
    ticksRef.current = {};

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setState((p) => ({ ...p, status: "error" }));
      return;
    }

    ws.onopen = () => {
      setState((p) => ({ ...p, status: "live" }));
      for (const sym of PE_SYMBOLS) {
        ws.send(
          JSON.stringify({
            ticks_history: sym.symbol,
            adjust_start_time: 1,
            count: maxTicks,
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
        ticksRef.current[sym] = prices.map((p, i) => ({ t: times[i] * 1000, price: Number(p) }));
      } else if (msg.msg_type === "tick" && msg.tick) {
        const sym = msg.tick.symbol as string;
        const arr = ticksRef.current[sym] ?? [];
        arr.push({ t: msg.tick.epoch * 1000, price: Number(msg.tick.quote) });
        if (arr.length > maxTicks) arr.splice(0, arr.length - maxTicks);
        ticksRef.current[sym] = arr;
      }
    };
    ws.onerror = () => setState((p) => ({ ...p, status: "error" }));
    ws.onclose = () => setState((p) => (p.status === "error" ? p : { ...p, status: "idle" }));

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
  }, [maxTicks]);

  useEffect(() => {
    if (!settings.autoScan) return;
    const id = window.setInterval(runScan, Math.max(500, settings.refreshMs));
    const kick = window.setTimeout(runScan, 900);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(kick);
    };
  }, [runScan, settings.autoScan, settings.refreshMs]);

  return { ...state, scanNow: runScan };
}
