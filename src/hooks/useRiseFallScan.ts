import { useEffect, useRef, useState, useCallback } from "react";
import { DERIV_SYMBOLS } from "./useDerivStream";
import { riseFallStats, marketIntel, type Tick } from "@/lib/analytics";

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const MAX_TICKS = 1000;
const MIN_TICKS = 400;

// Scan every non-crash market (crash/boom have one-sided distributions).
const SCAN_SYMBOLS = DERIV_SYMBOLS.filter(
  (s) => s.group === "Standard" || s.group === "1s" || s.group === "Jump",
);

export type RiseFallDecision = "BUY RISE" | "BUY FALL" | "WAIT";

export type RiseFallSignal = {
  symbol: string;
  name: string;
  decision: RiseFallDecision;
  confidence: number;        // 0-100 weighted score
  riseScore: number;         // 0-100
  fallScore: number;         // 0-100
  risk: "Low" | "Medium" | "High";
  reasons: string[];
  volatility: number;
  trendStrength: number;
  rsi: number;
  macdHist: number;
  mtfAgreement: number;      // 0-1 across 3 windows
  ts: number;
};

// Weighted contribution helper (percentage points added to rise or fall score).
function bucketConfidence(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreMarket(ticks: Tick[]): Omit<RiseFallSignal, "symbol" | "name" | "ts"> {
  const short = ticks.slice(-100);
  const mid = ticks.slice(-300);
  const long = ticks.slice(-1000);
  const rfS = riseFallStats(short);
  const rfM = riseFallStats(mid);
  const rfL = riseFallStats(long);
  const intel = marketIntel(long);

  // MTF agreement: fraction of windows leaning the same way as the shortest
  const dir = Math.sign(rfS.pRise - 0.5);
  const agree = [rfS, rfM, rfL].filter((r) => Math.sign(r.pRise - 0.5) === dir && dir !== 0).length;
  const mtfAgreement = dir === 0 ? 0 : agree / 3;

  // Weighted scoring — feature contributions in [-1..+1] toward RISE
  const trendFeat = Math.max(-1, Math.min(1, rfL.trendStrength / 5));
  const momFeat = Math.max(-1, Math.min(1, (rfM.rsi - 50) / 25));
  const macdFeat = Math.max(-1, Math.min(1, rfL.macd.hist * 1e5));
  const streakFeat = rfS.lastDir * Math.min(1, rfS.streak / 6);
  const mtfFeat = dir * mtfAgreement;
  const accelFeat = rfM.acceleration ? Math.sign(rfM.macd.hist) : 0;

  // Weights sum ~1
  const weighted =
    trendFeat * 0.25 +
    momFeat * 0.20 +
    macdFeat * 0.15 +
    streakFeat * 0.10 +
    mtfFeat * 0.20 +
    accelFeat * 0.10;

  // Map [-1..+1] -> rise/fall scores 0..100
  const riseScore = bucketConfidence(50 + weighted * 50);
  const fallScore = 100 - riseScore;

  // WAIT logic
  const rangebound = Math.abs(rfL.trendStrength) < 0.5;
  const chaotic = rfL.volatility > 1.5;
  const stall = Math.abs(weighted) < 0.20;
  const overheated = rfM.rsi > 78 || rfM.rsi < 22;
  const hiManip = intel.manipulation > 0.55;

  let decision: RiseFallDecision;
  let confidence: number;
  if (rangebound || stall || hiManip) {
    decision = "WAIT";
    confidence = Math.round(50 + Math.abs(weighted) * 20);
  } else if (weighted > 0) {
    decision = "BUY RISE";
    confidence = riseScore;
  } else {
    decision = "BUY FALL";
    confidence = fallScore;
  }
  if (confidence < 70 && decision !== "WAIT") { decision = "WAIT"; }

  // Risk
  const risk: "Low" | "Medium" | "High" =
    chaotic || overheated || hiManip ? "High" :
    rfL.volatility > 0.8 || Math.abs(rfL.trendStrength) < 1 ? "Medium" : "Low";

  const reasons: string[] = [];
  if (trendFeat > 0.2) reasons.push(`Long-term uptrend (strength ${rfL.trendStrength.toFixed(2)})`);
  if (trendFeat < -0.2) reasons.push(`Long-term downtrend (strength ${rfL.trendStrength.toFixed(2)})`);
  if (momFeat > 0.2) reasons.push(`Bullish momentum · RSI ${rfM.rsi.toFixed(0)}`);
  if (momFeat < -0.2) reasons.push(`Bearish momentum · RSI ${rfM.rsi.toFixed(0)}`);
  if (macdFeat > 0.1) reasons.push("MACD histogram bullish");
  if (macdFeat < -0.1) reasons.push("MACD histogram bearish");
  if (streakFeat > 0.3) reasons.push(`${rfS.streak}-tick rise streak`);
  if (streakFeat < -0.3) reasons.push(`${rfS.streak}-tick fall streak`);
  if (mtfAgreement >= 0.67) reasons.push(`MTF agreement ${Math.round(mtfAgreement * 100)}%`);
  if (mtfAgreement < 0.34 && decision !== "WAIT") reasons.push(`MTF divergence — caution`);
  if (rangebound) reasons.push("Rangebound — trend too weak");
  if (chaotic) reasons.push("Volatility elevated — false-break risk");
  if (overheated) reasons.push(`RSI extreme (${rfM.rsi.toFixed(0)})`);
  if (hiManip) reasons.push("Digit distribution anomaly");
  if (!reasons.length) reasons.push("Mixed conditions");

  return {
    decision, confidence, riseScore, fallScore, risk, reasons,
    volatility: rfL.volatility,
    trendStrength: rfL.trendStrength,
    rsi: rfM.rsi,
    macdHist: rfL.macd.hist,
    mtfAgreement,
  };
}

export function useRiseFallScan(enabled: boolean) {
  const [signals, setSignals] = useState<RiseFallSignal[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const ticksRef = useRef<Record<string, Tick[]>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close();
      wsRef.current = null;
      ticksRef.current = {};
      setSignals([]);
      setStatus("idle");
      return;
    }
    setStatus("connecting");
    ticksRef.current = {};
    let ws: WebSocket;
    try { ws = new WebSocket(WS_URL); } catch { setStatus("error"); return; }
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus("live");
      for (const s of SCAN_SYMBOLS) {
        ws.send(JSON.stringify({
          ticks_history: s.symbol, adjust_start_time: 1, count: MAX_TICKS,
          end: "latest", style: "ticks", subscribe: 1,
        }));
      }
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.error) return;
        if (msg.msg_type === "history" && msg.history && msg.echo_req?.ticks_history) {
          const sym = msg.echo_req.ticks_history as string;
          const { prices, times } = msg.history as { prices: number[]; times: number[] };
          ticksRef.current[sym] = prices.map((p, i) => ({ t: times[i] * 1000, price: p }));
        } else if (msg.msg_type === "tick" && msg.tick) {
          const sym = msg.tick.symbol as string;
          const arr = ticksRef.current[sym] ?? [];
          arr.push({ t: msg.tick.epoch * 1000, price: Number(msg.tick.quote) });
          if (arr.length > MAX_TICKS) arr.splice(0, arr.length - MAX_TICKS);
          ticksRef.current[sym] = arr;
        }
      } catch {}
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus((s) => (s === "error" ? s : "idle"));
    return () => {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ forget_all: "ticks" }));
        ws.close();
      } catch {}
    };
  }, [enabled]);

  const scan = useCallback(() => {
    const out: RiseFallSignal[] = [];
    const now = Date.now();
    for (const s of SCAN_SYMBOLS) {
      const ticks = ticksRef.current[s.symbol];
      if (!ticks || ticks.length < MIN_TICKS) continue;
      const scored = scoreMarket(ticks);
      out.push({ symbol: s.symbol, name: s.name, ts: now, ...scored });
    }
    out.sort((a, b) => b.confidence - a.confidence);
    setSignals(out);
    setLastScanAt(now);
  }, []);

  return { signals, status, scan, lastScanAt, scannedCount: SCAN_SYMBOLS.length, readyCount: Object.values(ticksRef.current).filter(t => t.length >= MIN_TICKS).length };
}
