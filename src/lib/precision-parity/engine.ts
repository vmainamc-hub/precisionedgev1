// Precision Parity AI — reasoning engine.
// Multiple specialist engines cooperate; the Decision Engine gates output.
// No engine may fire recommendations alone. NO_TRADE is a valid outcome.

import { lastDigit, type Tick } from "@/lib/analytics";
import type {
  BarSnapshot,
  DigitPsychology,
  Evidence,
  HiddenRegime,
  HypothesisEvaluation,
  MarketParityReport,
  MarketRegime,
  MaturityState,
  ParityContract,
  SecondOrderMatrix,
  TransitionMatrix,
  WindowStat,
} from "./types";

const WINDOWS = [20, 50, 100, 200, 500, 1000] as const;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const parityOf = (d: number): "EVEN" | "ODD" => (d % 2 === 0 ? "EVEN" : "ODD");

// Per-market session memory (parity history + prior recommendations).
interface SessionMemory {
  ticksSeen: number;
  priorRegimes: MarketRegime[];
  priorHidden: HiddenRegime[];
  // Prior signal snapshots for historical similarity.
  snapshots: Array<{
    evenPct: number;
    entropy: number;
    pEE: number;
    pOO: number;
    regime: MarketRegime;
    contract: ParityContract;
  }>;
  // Persistence tracker: current recommendation and how long it survived.
  currentContract: ParityContract | null;
  currentPersistence: number;
  currentMaturity: MaturityState;
  createdAt: number;
}

const MEMORY = new Map<string, SessionMemory>();

function getMemory(market: string): SessionMemory {
  let m = MEMORY.get(market);
  if (!m) {
    m = {
      ticksSeen: 0,
      priorRegimes: [],
      priorHidden: [],
      snapshots: [],
      currentContract: null,
      currentPersistence: 0,
      currentMaturity: "EMERGING",
      createdAt: Date.now(),
    };
    MEMORY.set(market, m);
  }
  return m;
}

export function resetParityMemory(market?: string) {
  if (market) MEMORY.delete(market);
  else MEMORY.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 2 — Even/Odd statistics
// ─────────────────────────────────────────────────────────────────────────
function windowStats(digits: number[], n: number): WindowStat {
  const slice = digits.slice(-n);
  const total = slice.length || 1;
  const even = slice.filter((d) => d % 2 === 0).length;
  const evenPct = even / total;
  const oddPct = 1 - evenPct;
  const entropy =
    -(evenPct > 0 ? evenPct * Math.log2(evenPct) : 0) -
    (oddPct > 0 ? oddPct * Math.log2(oddPct) : 0);
  return { n: slice.length, evenPct, oddPct, entropy };
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 3 — First-order Markov across every rolling window
// ─────────────────────────────────────────────────────────────────────────
function transitionMatrix(digits: number[], window: number): TransitionMatrix {
  const slice = digits.slice(-window);
  let ee = 0, eo = 0, oe = 0, oo = 0;
  for (let i = 1; i < slice.length; i++) {
    const a = slice[i - 1] % 2, b = slice[i] % 2;
    if (a === 0 && b === 0) ee++;
    else if (a === 0 && b === 1) eo++;
    else if (a === 1 && b === 0) oe++;
    else oo++;
  }
  const fromE = Math.max(1, ee + eo);
  const fromO = Math.max(1, oe + oo);
  return {
    window,
    eeCount: ee, eoCount: eo, oeCount: oe, ooCount: oo,
    pEE: ee / fromE, pEO: eo / fromE, pOE: oe / fromO, pOO: oo / fromO,
    sample: slice.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 4 — Second-order Markov (EE/EO/OE/OO -> next parity)
// ─────────────────────────────────────────────────────────────────────────
function secondOrder(digits: number[], window = 500): SecondOrderMatrix {
  const slice = digits.slice(-window);
  const parities = slice.map((d) => (d % 2 === 0 ? "E" : "O"));
  type K = "EE" | "EO" | "OE" | "OO";
  const nextEven: Record<K, number> = { EE: 0, EO: 0, OE: 0, OO: 0 };
  const total: Record<K, number> = { EE: 0, EO: 0, OE: 0, OO: 0 };
  for (let i = 2; i < parities.length; i++) {
    const key = (parities[i - 2] + parities[i - 1]) as K;
    total[key]++;
    if (parities[i] === "E") nextEven[key]++;
  }
  const pEvenAfter: Record<K, number> = {
    EE: total.EE ? nextEven.EE / total.EE : 0.5,
    EO: total.EO ? nextEven.EO / total.EO : 0.5,
    OE: total.OE ? nextEven.OE / total.OE : 0.5,
    OO: total.OO ? nextEven.OO / total.OO : 0.5,
  };
  return { window, pEvenAfter, counts: total };
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 5 — Hidden regime (heuristic HMM-style classifier)
// ─────────────────────────────────────────────────────────────────────────
function hiddenRegime(w100: WindowStat, w500: WindowStat, tr: TransitionMatrix): HiddenRegime {
  const evenBias = w100.evenPct - 0.5;
  const longBias = w500.evenPct - 0.5;
  const flip = (tr.pEO + tr.pOE) / 2; // higher = alternating
  const stick = (tr.pEE + tr.pOO) / 2;
  if (flip > 0.62) return "ALTERNATING";
  if (Math.abs(evenBias) < 0.03 && Math.abs(longBias) < 0.03) return "BALANCED";
  if (evenBias > 0.06 && longBias > 0.03) return "EVEN_DOMINANCE";
  if (evenBias < -0.06 && longBias < -0.03) return "ODD_DOMINANCE";
  if (Math.sign(evenBias) !== Math.sign(longBias) && Math.abs(evenBias) > 0.04)
    return "REVERSAL_BUILDING";
  if (stick > 0.62) return "EXPANSION";
  if (w100.entropy < 0.85) return "COMPRESSION";
  return "UNCERTAIN";
}

// ─────────────────────────────────────────────────────────────────────────
// Market Structure engine — regime label
// ─────────────────────────────────────────────────────────────────────────
function marketRegime(
  digits: number[],
  w100: WindowStat,
  w500: WindowStat,
  manipulation: number,
  fluctuation: number,
): MarketRegime {
  if (manipulation > 55) return "MANIPULATED";
  if (fluctuation > 70) return "CHAOTIC";
  const drift = Math.abs(w100.evenPct - w500.evenPct);
  if (drift > 0.08) return "TRENDING";
  if (w100.entropy > 0.985 && drift < 0.02) return "STABLE";
  if (w100.entropy < 0.9) return "COMPRESSED";
  if (w100.entropy > 0.995) return "EXPANDING";
  const recent = digits.slice(-40).map((d) => d % 2);
  let flips = 0;
  for (let i = 1; i < recent.length; i++) if (recent[i] !== recent[i - 1]) flips++;
  if (flips / Math.max(1, recent.length - 1) > 0.65) return "OSCILLATING";
  if (drift < 0.04 && w100.entropy > 0.95) return "RECOVERY";
  return "NEUTRAL";
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 8/9 — Green/Red bar intelligence
// ─────────────────────────────────────────────────────────────────────────
function digitFreq(digits: number[]): number[] {
  const f = new Array(10).fill(0);
  digits.forEach((d) => f[d]++);
  return f;
}

function barSnapshot(digits: number[], select: "max" | "min"): BarSnapshot {
  const recent = digits.slice(-100);
  const baseline = digits.slice(-500);
  const rTot = Math.max(1, recent.length);
  const bTot = Math.max(1, baseline.length);
  const rF = digitFreq(recent).map((f) => f / rTot);
  const bF = digitFreq(baseline).map((f) => f / bTot);
  let idx = 0;
  for (let d = 1; d < 10; d++) {
    if (select === "max" ? rF[d] > rF[idx] : rF[d] < rF[idx]) idx = d;
  }
  // Persistence: how many recent ticks the bar digit has held the position.
  let persistence = 0;
  for (let i = recent.length - 1; i >= Math.max(0, recent.length - 30); i--) {
    const slice = recent.slice(0, i + 1);
    const f = digitFreq(slice);
    let leader = 0;
    for (let d = 1; d < 10; d++) {
      if (select === "max" ? f[d] > f[leader] : f[d] < f[leader]) leader = d;
    }
    if (leader === idx) persistence++;
    else break;
  }
  return {
    digit: idx,
    parity: parityOf(idx),
    zone: idx <= 4 ? "LOWER" : "UPPER",
    pct: rF[idx],
    velocity: rF[idx] - bF[idx],
    persistence,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 10 — Digit psychology
// ─────────────────────────────────────────────────────────────────────────
function digitPsychology(digits: number[]): DigitPsychology {
  const recent = digits.slice(-100);
  const baseline = digits.slice(-500);
  const rTot = Math.max(1, recent.length);
  const bTot = Math.max(1, baseline.length);
  const rF = digitFreq(recent).map((f) => f / rTot);
  const bF = digitFreq(baseline).map((f) => f / bTot);
  const idxSort = (arr: number[]) => [...arr.keys()].sort((a, b) => arr[b] - arr[a]);
  const desc = idxSort(rF);
  const asc = [...desc].reverse();
  const delta = rF.map((v, d) => v - bF[d]);
  const rising = delta.indexOf(Math.max(...delta));
  const falling = delta.indexOf(Math.min(...delta));
  const rotationSpeed = clamp01(delta.reduce((a, v) => a + Math.abs(v), 0) / 2);
  const clustering = clamp01(Math.max(...rF) - 0.1);
  const zoneA = rF.slice(0, 5).reduce((a, b) => a + b, 0);
  return {
    hot: desc[0],
    cold: asc[0],
    mostAppearing: desc[0],
    secondMostAppearing: desc[1],
    leastAppearing: asc[0],
    secondLeastAppearing: asc[1],
    rising,
    falling,
    rotationSpeed,
    clustering,
    zoneA,
    zoneB: 1 - zoneA,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 12 — Manipulation & fluctuation
// ─────────────────────────────────────────────────────────────────────────
function manipulationScore(digits: number[]): { manipulation: number; fluctuation: number; crowding: number } {
  const recent = digits.slice(-200);
  const total = Math.max(1, recent.length);
  const freq = digitFreq(recent).map((f) => f / total);
  const tvd = 0.5 * freq.reduce((a, p) => a + Math.abs(p - 0.1), 0);
  const manipulation = clamp(tvd * 220);
  const crowding = clamp((Math.max(...freq) - 0.1) * 500);
  // Fluctuation: variance of rolling parity mean across chunks.
  const chunkSize = 20;
  const means: number[] = [];
  for (let i = 0; i + chunkSize <= recent.length; i += chunkSize) {
    const c = recent.slice(i, i + chunkSize);
    means.push(c.filter((d) => d % 2 === 0).length / c.length);
  }
  const mu = means.reduce((a, b) => a + b, 0) / Math.max(1, means.length);
  const variance = means.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, means.length);
  const fluctuation = clamp(variance * 900);
  return { manipulation, fluctuation, crowding };
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 7 — Historical similarity against session snapshots
// ─────────────────────────────────────────────────────────────────────────
function historicalSimilarity(
  mem: SessionMemory,
  evenPct: number,
  entropy: number,
  pEE: number,
  pOO: number,
  contract: ParityContract,
): number {
  if (mem.snapshots.length < 3) return 0.5;
  const relevant = mem.snapshots.filter((s) => s.contract === contract);
  if (relevant.length === 0) return 0.4;
  // 1 - average normalised distance in feature space.
  const dist = relevant.map((s) => {
    return (
      Math.abs(s.evenPct - evenPct) +
      Math.abs(s.entropy - entropy) * 0.5 +
      Math.abs(s.pEE - pEE) +
      Math.abs(s.pOO - pOO)
    ) / 3.5;
  });
  const avg = dist.reduce((a, b) => a + b, 0) / dist.length;
  return clamp01(1 - avg);
}

// ─────────────────────────────────────────────────────────────────────────
// Engine 15 — Decision Engine (hypothesis competition)
// ─────────────────────────────────────────────────────────────────────────
export interface ParitySettings {
  autoScan: boolean;
  refreshMs: number;
  minTicks: number;
  minConfidence: number;      // 0..100
  maxManipulation: number;    // 0..100
  maxContradiction: number;   // 0..100
  minPersistenceTicks: number;
  minHoldSeconds: number;
  requireMature: boolean;
}

export const DEFAULT_PARITY_SETTINGS: ParitySettings = {
  autoScan: true,
  refreshMs: 1500,
  minTicks: 200,
  minConfidence: 68,
  maxManipulation: 35,
  maxContradiction: 45,
  minPersistenceTicks: 4,
  minHoldSeconds: 20,
  requireMature: true,
};

function evaluateHypothesis(
  contract: ParityContract,
  args: {
    windows: Record<number, WindowStat>;
    transitions: TransitionMatrix[];
    secondOrder: SecondOrderMatrix;
    hiddenRegime: HiddenRegime;
    regime: MarketRegime;
    green: BarSnapshot;
    red: BarSnapshot;
    psy: DigitPsychology;
    manipulation: number;
    fluctuation: number;
    similarity: number;
    lastParity: "EVEN" | "ODD";
    prevParity: "EVEN" | "ODD";
  },
): HypothesisEvaluation {
  const target: "EVEN" | "ODD" = contract === "BUY_EVEN" ? "EVEN" : "ODD";
  const supports: Evidence[] = [];
  const conflicts: Evidence[] = [];

  // 1. Multi-window dominance
  const bias = (w: WindowStat) => (target === "EVEN" ? w.evenPct - 0.5 : w.oddPct - 0.5);
  const dominance = [args.windows[100], args.windows[200], args.windows[500]]
    .map(bias)
    .reduce((a, b) => a + b, 0) / 3;
  if (dominance > 0.02) {
    supports.push({
      engine: "Statistics",
      supports: contract,
      strength: clamp01(dominance * 8),
      detail: `${target} bias +${(dominance * 100).toFixed(1)}% across 100/200/500 tick windows`,
    });
  } else if (dominance < -0.02) {
    conflicts.push({
      engine: "Statistics",
      supports: contract === "BUY_EVEN" ? "BUY_ODD" : "BUY_EVEN",
      strength: clamp01(-dominance * 8),
      detail: `${target} share is ${(dominance * 100).toFixed(1)}% below fair across rolling windows`,
    });
  }

  // 2. Markov transition continuation
  const mkContinuation = args.transitions.map((t) =>
    target === "EVEN"
      ? (args.lastParity === "EVEN" ? t.pEE : t.pOE)
      : (args.lastParity === "EVEN" ? t.pEO : t.pOO),
  );
  const avgCont = mkContinuation.reduce((a, b) => a + b, 0) / mkContinuation.length;
  if (avgCont > 0.53) {
    supports.push({
      engine: "Markov",
      supports: contract,
      strength: clamp01((avgCont - 0.5) * 10),
      detail: `Transition models show P(next=${target}) ≈ ${(avgCont * 100).toFixed(1)}% across ${args.transitions.length} horizons`,
    });
  } else if (avgCont < 0.47) {
    conflicts.push({
      engine: "Markov",
      supports: contract === "BUY_EVEN" ? "BUY_ODD" : "BUY_EVEN",
      strength: clamp01((0.5 - avgCont) * 10),
      detail: `Transition models disagree with ${target} continuation (${(avgCont * 100).toFixed(1)}%)`,
    });
  }

  // 3. Second-order Markov
  const key = (args.prevParity[0] + args.lastParity[0]) as "EE" | "EO" | "OE" | "OO";
  const soEven = args.secondOrder.pEvenAfter[key];
  const soTarget = target === "EVEN" ? soEven : 1 - soEven;
  if (soTarget > 0.55) {
    supports.push({
      engine: "Higher-Order Markov",
      supports: contract,
      strength: clamp01((soTarget - 0.5) * 6),
      detail: `Sequence ${key} historically resolves to ${target} ${(soTarget * 100).toFixed(0)}% of the time`,
    });
  } else if (soTarget < 0.45) {
    conflicts.push({
      engine: "Higher-Order Markov",
      supports: contract === "BUY_EVEN" ? "BUY_ODD" : "BUY_EVEN",
      strength: clamp01((0.5 - soTarget) * 6),
      detail: `Sequence ${key} favours the opposite parity (${((1 - soTarget) * 100).toFixed(0)}%)`,
    });
  }

  // 4. Hidden regime alignment
  const hr = args.hiddenRegime;
  const regSupport =
    (hr === "EVEN_DOMINANCE" && target === "EVEN") ||
    (hr === "ODD_DOMINANCE" && target === "ODD");
  const regConflict =
    (hr === "EVEN_DOMINANCE" && target === "ODD") ||
    (hr === "ODD_DOMINANCE" && target === "EVEN");
  if (regSupport) supports.push({ engine: "Hidden Regime", supports: contract, strength: 0.75, detail: `Hidden regime = ${hr}` });
  else if (regConflict) conflicts.push({ engine: "Hidden Regime", supports: contract === "BUY_EVEN" ? "BUY_ODD" : "BUY_EVEN", strength: 0.7, detail: `Hidden regime = ${hr}` });
  else if (hr === "ALTERNATING" || hr === "REVERSAL_BUILDING")
    conflicts.push({ engine: "Hidden Regime", supports: "NEUTRAL", strength: 0.5, detail: `Hidden regime = ${hr} — direction unstable` });

  // 5. Green/Red bar
  if (args.green.parity === target && args.green.velocity >= 0) {
    supports.push({
      engine: "Green Bar",
      supports: contract,
      strength: clamp01(0.4 + args.green.velocity * 5),
      detail: `Green bar d${args.green.digit} (${target}) rising, persistence ${args.green.persistence}t`,
    });
  } else if (args.green.parity !== target && args.green.velocity > 0.02) {
    conflicts.push({
      engine: "Green Bar",
      supports: args.green.parity === "EVEN" ? "BUY_EVEN" : "BUY_ODD",
      strength: clamp01(args.green.velocity * 5),
      detail: `Green bar d${args.green.digit} favours ${args.green.parity}`,
    });
  }
  if (args.red.parity !== target) {
    supports.push({
      engine: "Red Bar",
      supports: contract,
      strength: 0.35,
      detail: `Red bar d${args.red.digit} draining the opposite parity`,
    });
  } else if (args.red.parity === target && args.red.velocity < -0.02) {
    conflicts.push({
      engine: "Red Bar",
      supports: contract === "BUY_EVEN" ? "BUY_ODD" : "BUY_EVEN",
      strength: 0.5,
      detail: `Red bar d${args.red.digit} draining ${target} probability`,
    });
  }

  // 6. Digit psychology
  const hotP = parityOf(args.psy.hot);
  const risingP = parityOf(args.psy.rising);
  if (hotP === target) supports.push({ engine: "Digit Psychology", supports: contract, strength: 0.4, detail: `Hot digit ${args.psy.hot} is ${target}` });
  else conflicts.push({ engine: "Digit Psychology", supports: hotP === "EVEN" ? "BUY_EVEN" : "BUY_ODD", strength: 0.3, detail: `Hot digit ${args.psy.hot} is ${hotP}` });
  if (risingP === target) supports.push({ engine: "Digit Psychology", supports: contract, strength: 0.4, detail: `Fastest-rising digit ${args.psy.rising} is ${target}` });

  // 7. Manipulation & fluctuation as blockers, not signals
  if (args.manipulation > 40) conflicts.push({ engine: "Manipulation", supports: "NEUTRAL", strength: clamp01(args.manipulation / 100), detail: `Distribution distorted (${args.manipulation.toFixed(0)}%)` });
  if (args.fluctuation > 55) conflicts.push({ engine: "Fluctuation", supports: "NEUTRAL", strength: clamp01(args.fluctuation / 100), detail: `Rolling parity variance high (${args.fluctuation.toFixed(0)}%)` });

  // 8. Historical similarity as supporting evidence, capped
  if (args.similarity > 0.6) supports.push({ engine: "Historical Similarity", supports: contract, strength: Math.min(0.4, args.similarity - 0.3), detail: `Similar past states resolved as ${target} (${(args.similarity * 100).toFixed(0)}% match)` });

  // ── Bayesian confidence: prior 50 nudged by aligned/conflicting evidence
  const supStrength = supports.reduce((a, e) => a + e.strength, 0);
  const conStrength = conflicts.reduce((a, e) => a + e.strength, 0);
  const net = supStrength - conStrength;
  const confidence = clamp(50 + net * 12);
  const contradictionScore = clamp(conStrength * 20);

  const reasoning: string[] = [];
  supports.slice(0, 6).forEach((e) => reasoning.push(`+ ${e.detail}`));
  conflicts.slice(0, 3).forEach((e) => reasoning.push(`− ${e.detail}`));

  return {
    contract,
    confidence,
    supports,
    conflicts,
    contradictionScore,
    maturity: "EMERGING",
    persistenceTicks: 0,
    reasoning,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Trade Maturity Engine — lifecycle across evaluations
// ─────────────────────────────────────────────────────────────────────────
function updateMaturity(mem: SessionMemory, chosen: ParityContract | null, confidence: number): { maturity: MaturityState; persistence: number } {
  if (!chosen) {
    mem.currentContract = null;
    mem.currentPersistence = 0;
    mem.currentMaturity = "EXPIRED";
    return { maturity: "EXPIRED", persistence: 0 };
  }
  if (mem.currentContract !== chosen) {
    mem.currentContract = chosen;
    mem.currentPersistence = 1;
    mem.currentMaturity = "EMERGING";
  } else {
    mem.currentPersistence++;
  }
  let m: MaturityState = "EMERGING";
  if (mem.currentPersistence >= 12 && confidence >= 78) m = "PEAK";
  else if (mem.currentPersistence >= 6 && confidence >= 68) m = "MATURE";
  else if (mem.currentPersistence >= 3) m = "BUILDING";
  else m = "EMERGING";
  if (confidence < 55) m = "WEAKENING";
  mem.currentMaturity = m;
  return { maturity: m, persistence: mem.currentPersistence };
}

// ─────────────────────────────────────────────────────────────────────────
// Public: analyseMarketParity
// ─────────────────────────────────────────────────────────────────────────
export function analyseMarketParity(
  market: string,
  name: string,
  ticks: Tick[],
  settings: ParitySettings = DEFAULT_PARITY_SETTINGS,
): MarketParityReport {
  const mem = getMemory(market);
  mem.ticksSeen = Math.max(mem.ticksSeen, ticks.length);
  const digits = ticks.map((t) => lastDigit(t.price));

  const windows: Record<number, WindowStat> = {};
  for (const w of WINDOWS) windows[w] = windowStats(digits, w);

  const transitions = WINDOWS.map((w) => transitionMatrix(digits, w));
  const so = secondOrder(digits, 500);
  const { manipulation, fluctuation, crowding } = manipulationScore(digits);
  const regime = marketRegime(digits, windows[100], windows[500], manipulation, fluctuation);
  const hidden = hiddenRegime(windows[100], windows[500], transitions[2]);
  const green = barSnapshot(digits, "max");
  const red = barSnapshot(digits, "min");
  const psy = digitPsychology(digits);

  mem.priorRegimes.push(regime); if (mem.priorRegimes.length > 200) mem.priorRegimes.shift();
  mem.priorHidden.push(hidden); if (mem.priorHidden.length > 200) mem.priorHidden.shift();

  const last = digits[digits.length - 1] ?? 0;
  const prev = digits[digits.length - 2] ?? last;
  const lastP = parityOf(last) as "EVEN" | "ODD";
  const prevP = parityOf(prev) as "EVEN" | "ODD";

  // Historical similarity per hypothesis
  const simEven = historicalSimilarity(mem, windows[100].evenPct, windows[100].entropy, transitions[2].pEE, transitions[2].pOO, "BUY_EVEN");
  const simOdd = historicalSimilarity(mem, windows[100].evenPct, windows[100].entropy, transitions[2].pEE, transitions[2].pOO, "BUY_ODD");

  const common = {
    windows,
    transitions,
    secondOrder: so,
    hiddenRegime: hidden,
    regime,
    green,
    red,
    psy,
    manipulation,
    fluctuation,
    lastParity: lastP,
    prevParity: prevP,
  };

  const hEven = evaluateHypothesis("BUY_EVEN", { ...common, similarity: simEven });
  const hOdd = evaluateHypothesis("BUY_ODD", { ...common, similarity: simOdd });

  // Pick stronger hypothesis
  const enough = ticks.length >= settings.minTicks;
  const winner = hEven.confidence >= hOdd.confidence ? hEven : hOdd;
  const loser = winner === hEven ? hOdd : hEven;
  const margin = winner.confidence - loser.confidence;

  const chosenContract = winner.contract;
  const { maturity, persistence } = updateMaturity(
    mem,
    winner.confidence >= settings.minConfidence ? chosenContract : null,
    winner.confidence,
  );
  winner.maturity = maturity;
  winner.persistenceTicks = persistence;

  // Decision gates
  const reasons: string[] = [];
  let state: "READY" | "BUILDING" | "MONITORING" | "REJECTED" = "MONITORING";
  let recommendation: ParityContract | "NO_TRADE" = "NO_TRADE";

  if (!enough) {
    reasons.push(`Only ${ticks.length}/${settings.minTicks} ticks — still gathering evidence`);
    state = "MONITORING";
  } else if (manipulation > settings.maxManipulation) {
    reasons.push(`Manipulation ${manipulation.toFixed(0)}% exceeds cap ${settings.maxManipulation}%`);
    state = "REJECTED";
  } else if (winner.contradictionScore > settings.maxContradiction) {
    reasons.push(`Contradiction ${winner.contradictionScore.toFixed(0)}% above tolerance ${settings.maxContradiction}%`);
    state = "REJECTED";
  } else if (margin < 4) {
    reasons.push(`Hypotheses too close (${winner.confidence.toFixed(0)} vs ${loser.confidence.toFixed(0)}) — no decisive edge`);
    state = "MONITORING";
  } else if (winner.confidence < settings.minConfidence) {
    reasons.push(`Confidence ${winner.confidence.toFixed(0)} below threshold ${settings.minConfidence}`);
    state = "BUILDING";
  } else if (settings.requireMature && (maturity === "EMERGING" || maturity === "BUILDING")) {
    reasons.push(`Setup is ${maturity.toLowerCase()} — needs ${settings.minPersistenceTicks}+ persistent ticks`);
    state = "BUILDING";
  } else if (persistence < settings.minPersistenceTicks) {
    reasons.push(`Persistence ${persistence}/${settings.minPersistenceTicks} ticks`);
    state = "BUILDING";
  } else {
    recommendation = chosenContract;
    state = "READY";
    reasons.push(...winner.reasoning);
    // Record snapshot for historical similarity
    mem.snapshots.push({
      evenPct: windows[100].evenPct,
      entropy: windows[100].entropy,
      pEE: transitions[2].pEE,
      pOO: transitions[2].pOO,
      regime,
      contract: chosenContract,
    });
    if (mem.snapshots.length > 100) mem.snapshots.shift();
  }

  return {
    market,
    name,
    ticks: ticks.length,
    regime,
    hiddenRegime: hidden,
    windows,
    transitions,
    secondOrder: so,
    greenBar: green,
    redBar: red,
    digitPsychology: psy,
    manipulation,
    fluctuation,
    crowding,
    historicalSimilarity: Math.max(simEven, simOdd),
    verdict: {
      recommendation,
      state,
      confidence: winner.confidence,
      reasons,
      hypotheses: [hEven, hOdd],
    },
  };
}