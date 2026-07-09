// Precision Edge AI V2 — Market Reasoning Intelligence Engine.
//
// Philosophy: do NOT score markets with one universal engine. Each supported
// contract owns an independent intelligence engine with its own psychology,
// gates, digit compatibility and confidence model. Every engine reasons on its
// own; only the decision layer compares them and recommends the strongest,
// most internally-consistent hypothesis. If none is coherent -> No Trade.

import { lastDigit } from "@/lib/analytics";
import type {
  ContractId,
  ContractVerdict,
  DigitProfile,
  DigitStatistics,
  Gate,
  MarketPsychology,
  MarketReasoning,
  Tick,
  TraderBehaviour,
  VerdictState,
} from "./types";
import { classifyDigits, groupStrength, type DigitPersonality } from "./digit-personality";
import { computeMemory, historicalAgreement } from "./memory";
import { classifyPattern, matchPattern, recordPattern, type PatternLabel } from "./pattern-library";
import { measureFluctuation } from "./fluctuation";
import { computeEdge } from "./edge-composite";

const RECENT = 60; // recent-behaviour window
const WINDOW = 500; // reasoning window

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Digit Statistics Engine
// ---------------------------------------------------------------------------
export function digitStatistics(ticks: Tick[]): DigitStatistics {
  const win = ticks.slice(-WINDOW);
  const digits = win.map((t) => lastDigit(t.price));
  const total = Math.max(1, digits.length);
  const freq = new Array(10).fill(0);
  digits.forEach((d) => freq[d]++);
  const pct = freq.map((f) => f / total);

  const recent = digits.slice(-Math.min(RECENT, digits.length));
  const rTotal = Math.max(1, recent.length);
  const rFreq = new Array(10).fill(0);
  recent.forEach((d) => rFreq[d]++);
  const recentPct = rFreq.map((f) => f / rTotal);

  const profiles: DigitProfile[] = [];
  for (let d = 0; d < 10; d++) {
    const p = pct[d];
    const rp = recentPct[d];
    const pressure = rp - p;
    const temp = p >= 0.125 ? "hot" : p <= 0.075 ? "cold" : "neutral";
    const trend = pressure > 0.02 ? "rising" : pressure < -0.02 ? "falling" : "stable";
    profiles.push({
      d,
      pct: p,
      recentPct: rp,
      pressure,
      temp,
      trend,
      low: d <= 4,
      high: d >= 5,
      even: d % 2 === 0,
      zone: d <= 4 ? "A" : "B",
    });
  }

  const hot = profiles.filter((p) => p.temp === "hot").map((p) => p.d);
  const cold = profiles.filter((p) => p.temp === "cold").map((p) => p.d);
  const dominant = pct.indexOf(Math.max(...pct));
  const suppressed = pct.indexOf(Math.min(...pct));

  return {
    digits,
    freq,
    pct,
    recentPct,
    profiles,
    hot,
    cold,
    dominant,
    suppressed,
    lastDigit: digits[digits.length - 1] ?? 0,
    windowSize: digits.length,
  };
}

// ---------------------------------------------------------------------------
// Market Psychology Engine
// ---------------------------------------------------------------------------
function marketPsychology(stats: DigitStatistics, ticks: Tick[]): MarketPsychology {
  const { pct } = stats;
  const entropy = -pct.reduce((a, p) => (p > 0 ? a + p * Math.log2(p) : a), 0);
  const entropyNorm = entropy / Math.log2(10);

  const zoneA = pct.slice(0, 5).reduce((a, b) => a + b, 0);
  const zoneB = 1 - zoneA;
  const evenPct = [0, 2, 4, 6, 8].reduce((a, d) => a + pct[d], 0);
  const oddPct = 1 - evenPct;

  // Manipulation: how far the distribution deviates from uniform (0.1 each).
  const tvd = 0.5 * pct.reduce((a, p) => a + Math.abs(p - 0.1), 0); // 0..~0.9
  const manipulation = clamp(tvd * 220);

  // Crowding: dominant single-digit concentration above fair share.
  const crowding = clamp((Math.max(...pct) - 0.1) * 500);

  // Health: high entropy + low manipulation + adequate sample.
  const sample = Math.min(1, stats.windowSize / WINDOW);
  const health = clamp(entropyNorm * 70 + (1 - manipulation / 100) * 20 + sample * 10);
  const healthLabel =
    health >= 82 ? "excellent" : health >= 70 ? "good" : health >= 58 ? "average" : health >= 45 ? "weak" : "avoid";

  return {
    entropyNorm,
    health,
    healthLabel,
    zoneA,
    zoneB,
    oddPct,
    evenPct,
    manipulation,
    crowding,
    persistenceTicks: ticks.length,
  };
}

// ---------------------------------------------------------------------------
// Trader Behaviour Engine
// ---------------------------------------------------------------------------
function traderBehaviour(stats: DigitStatistics): TraderBehaviour {
  const { profiles } = stats;
  const sum = (fn: (p: DigitProfile) => boolean) =>
    profiles.filter(fn).reduce((a, p) => a + p.pressure, 0);

  const overPressure = sum((p) => p.high); // high digits gaining => Over group winning
  const underPressure = sum((p) => p.low);
  const oddPressure = sum((p) => !p.even);
  const evenPressure = sum((p) => p.even);

  const groups: { name: string; v: number }[] = [
    { name: "Over traders (high digits)", v: overPressure },
    { name: "Under traders (low digits)", v: underPressure },
    { name: "Odd traders", v: oddPressure },
    { name: "Even traders", v: evenPressure },
  ];
  groups.sort((a, b) => b.v - a.v);
  const dominantGroup = groups[0].name;
  const exhaustingGroup = groups[groups.length - 1].name;

  const summary =
    `${dominantGroup} are absorbing probability while ${exhaustingGroup.toLowerCase()} lose strength.`;

  return {
    overPressure,
    underPressure,
    oddPressure,
    evenPressure,
    dominantGroup,
    exhaustingGroup,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Contract Intelligence Engines — one independent engine per contract.
// ---------------------------------------------------------------------------
interface ContractDef {
  id: ContractId;
  label: string;
  side: "UNDER" | "OVER";
  barrier: number;
  winners: number[]; // digits that win the contract
}

const CONTRACTS: ContractDef[] = [
  { id: "UNDER6", label: "Under 6", side: "UNDER", barrier: 6, winners: [0, 1, 2, 3, 4, 5] },
  { id: "UNDER7", label: "Under 7", side: "UNDER", barrier: 7, winners: [0, 1, 2, 3, 4, 5, 6] },
  { id: "UNDER8", label: "Under 8", side: "UNDER", barrier: 8, winners: [0, 1, 2, 3, 4, 5, 6, 7] },
  { id: "OVER1", label: "Over 1", side: "OVER", barrier: 1, winners: [2, 3, 4, 5, 6, 7, 8, 9] },
  { id: "OVER2", label: "Over 2", side: "OVER", barrier: 2, winners: [3, 4, 5, 6, 7, 8, 9] },
  { id: "OVER3", label: "Over 3", side: "OVER", barrier: 3, winners: [4, 5, 6, 7, 8, 9] },
];

function trailingStreak(digits: number[], winners: Set<number>): number {
  let n = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (winners.has(digits[i])) n++;
    else break;
  }
  return n;
}

interface ReasoningContext {
  stats: DigitStatistics;
  psy: MarketPsychology;
  beh: TraderBehaviour;
  personalities: DigitPersonality[];
  historical: number;   // 0..1
  fluctuation: number;  // 0..1
  patternMatch: number; // 0..1
}

// ---------------------------------------------------------------------------
// Scanner-Mindset Gates — applied to ALL OVER (1/2/3) and UNDER (6/7/8)
// ---------------------------------------------------------------------------
// Encodes the qualifying conditions from the Over 2 Strategy Scanner and the
// Under 7 Multi-Market Scanner. The AI reasons WITH these conditions in mind
// for every over/under verdict — they do not all need to fire, but the more
// sub-conditions align, the higher the quality. Only a severely incomplete
// mindset (score < 0.45) blocks READY; partial alignment shapes confidence.
//
// Setup pattern:
//   OVER family  → hot ∈ {0,2,4}, cold ∈ {5,7,9},
//                  low 0/1/2 elevated (>10.5%) & exhausting,
//                  high 7/8/9 suppressed (<10.5%) & quietly rising,
//                  manipulation < 20%.
//   UNDER family → mirror.
interface ScannerMindset {
  applicable: boolean;
  pass: boolean;
  detail: string;
  score: number;   // 0..1
  failed: string[];
}

function scannerMindset(
  contractId: ContractId,
  stats: DigitStatistics,
  psy: MarketPsychology,
): ScannerMindset {
  const isOver = contractId === "OVER1" || contractId === "OVER2" || contractId === "OVER3";
  const isUnder = contractId === "UNDER6" || contractId === "UNDER7" || contractId === "UNDER8";
  if (!isOver && !isUnder) {
    return { applicable: false, pass: true, detail: "n/a", score: 1, failed: [] };
  }
  const dominantGroup = isOver ? [0, 1, 2] : [7, 8, 9];
  const emergingGroup = isOver ? [7, 8, 9] : [0, 1, 2];
  const hotAllowed = isOver ? new Set([0, 2, 4]) : new Set([5, 7, 9]);
  const coldAllowed = isOver ? new Set([5, 7, 9]) : new Set([0, 2, 4]);

  const { pct, profiles, dominant, suppressed } = stats;
  const failed: string[] = [];

  const hotOk = hotAllowed.has(dominant);
  if (!hotOk) failed.push(`hot d${dominant} ∉ {${[...hotAllowed].join(",")}}`);
  const coldOk = coldAllowed.has(suppressed);
  if (!coldOk) failed.push(`cold d${suppressed} ∉ {${[...coldAllowed].join(",")}}`);

  const domElevatedCount = dominantGroup.filter((d) => pct[d] > 0.105).length;
  const domElevated = domElevatedCount >= 2;
  if (!domElevated) failed.push(`only ${domElevatedCount}/3 of ${dominantGroup.join("/")} elevated`);

  const domExhaustCount = dominantGroup.filter((d) => profiles[d].pressure <= 0.005).length;
  const domExhausting = domExhaustCount >= 2;
  if (!domExhausting) failed.push(`only ${domExhaustCount}/3 of ${dominantGroup.join("/")} exhausting`);

  const emSupCount = emergingGroup.filter((d) => pct[d] < 0.105).length;
  const emSuppressed = emSupCount >= 2;
  if (!emSuppressed) failed.push(`only ${emSupCount}/3 of ${emergingGroup.join("/")} suppressed`);

  const emRisingCount = emergingGroup.filter((d) => profiles[d].pressure > 0).length;
  const emRising = emRisingCount >= 2;
  if (!emRising) failed.push(`only ${emRisingCount}/3 of ${emergingGroup.join("/")} rising`);

  const manipOk = psy.manipulation < 20;
  if (!manipOk) failed.push(`manip ${psy.manipulation.toFixed(0)}% ≥ 20%`);

  const checks = [hotOk, coldOk, domElevated, domExhausting, emSuppressed, emRising, manipOk];
  const passed = checks.filter(Boolean).length;
  const pass = failed.length === 0;
  const family = isOver ? "OVER" : "UNDER";
  const detail = pass
    ? `${family} scanner setup complete (${passed}/7)`
    : `${family} mindset ${passed}/7 aligned${failed.length ? ` — ${failed.slice(0, 2).join("; ")}` : ""}`;
  return { applicable: true, pass, detail, score: passed / 7, failed };
}


function evaluateContract(def: ContractDef, ctx: ReasoningContext): ContractVerdict {
  const { stats, psy, beh, personalities, historical, fluctuation } = ctx;
  const winners = new Set(def.winners);
  const losers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !winners.has(d));
  const theoretical = def.winners.length / 10;

  const empWinRate = def.winners.reduce((a, d) => a + stats.pct[d], 0);
  const recentWinRate = def.winners.reduce((a, d) => a + stats.recentPct[d], 0);
  const edge = empWinRate - theoretical;
  const momentum = recentWinRate - empWinRate;

  const loserFair = losers.length / 10;
  const loserRecent = losers.reduce((a, d) => a + stats.recentPct[d], 0);
  const loserSuppression = loserFair - loserRecent;

  const hostileLoser = losers.find((d) => {
    const p = stats.profiles[d];
    return p.temp === "hot" && p.trend === "rising";
  });

  const groupPressure = def.side === "UNDER" ? beh.underPressure : beh.overPressure;
  const persistenceTicks = trailingStreak(stats.digits, winners);

  // ── Digit-personality reasoning ─────────────────────────────────────
  const winnerStrength = groupStrength(personalities, def.winners);
  const loserStrength = groupStrength(personalities, losers);
  const migration = winnerStrength - loserStrength; // -2..+2

  // Structurally important digits — adaptive, not hardcoded. Pick the digits
  // whose personality has the largest absolute impact for this contract:
  // the strongest winner and strongest loser.
  const rankedWinners = [...def.winners].sort((a, b) => personalities[b].score - personalities[a].score);
  const rankedLosers = [...losers].sort((a, b) => personalities[a].score - personalities[b].score);
  const structural = [rankedWinners[0], rankedLosers[0]].filter((d) => d !== undefined) as number[];
  const structuralSupport = structural.every((d) => {
    const p = personalities[d];
    if (def.winners.includes(d)) return p.score > -0.1;
    return p.score < 0.1;
  });

  // ── Bar behaviour consistency: recent winner-side change should agree ──
  const barConsistent = def.side === "UNDER" ? momentum >= -0.01 : momentum >= -0.01;

  // ── Scanner mindset (OVER 2 / UNDER 7 only) ────────────────────────
  // The AI reasons with the OVER2/UNDER7 scanner's structural conditions as
  // the authoritative setup. When applicable and it fails, the verdict
  // cannot be READY — this is the primary quality lift.
  const mindset = scannerMindset(def.id, stats, psy);

  // ── Gates ───────────────────────────────────────────────────────────
  const gates: Gate[] = [
    {
      name: "Edge",
      major: true,
      ok: edge >= 0.012,
      detail:
        edge >= 0.012
          ? `Winning digits hold ${(empWinRate * 100).toFixed(1)}% vs ${(theoretical * 100).toFixed(0)}% fair`
          : `Winning digits only ${(empWinRate * 100).toFixed(1)}% — no edge over ${(theoretical * 100).toFixed(0)}%`,
    },
    {
      name: "Momentum",
      major: true,
      ok: momentum >= -0.01,
      detail:
        momentum >= -0.01
          ? `Probability flow ${momentum >= 0.01 ? "expanding" : "holding"} toward winning digits`
          : `Probability draining away from winning digits`,
    },
    {
      name: "Loser suppression",
      major: true,
      ok: loserSuppression >= -0.005,
      detail:
        loserSuppression >= -0.005
          ? `Losing digits ${losers.join(",")} remain suppressed`
          : `Losing digits ${losers.join(",")} are expanding`,
    },
    {
      name: "Digit compatibility",
      major: true,
      ok: hostileLoser === undefined,
      detail:
        hostileLoser === undefined
          ? `No hot losing digit contradicting ${def.label}`
          : `Digit ${hostileLoser} is hot & rising — contradicts ${def.label}`,
    },
    {
      name: "Trader alignment",
      major: true,
      ok: groupPressure >= -0.01,
      detail:
        groupPressure >= -0.01
          ? `${def.side === "UNDER" ? "Under" : "Over"} traders absorbing probability`
          : `${def.side === "UNDER" ? "Under" : "Over"} traders contradict ${def.label}`,
    },
    {
      name: "Manipulation",
      major: true,
      ok: psy.manipulation < 26,
      detail: `Manipulation ${psy.manipulation.toFixed(0)}%`,
    },
    {
      name: "Migration",
      major: true,
      ok: migration >= -0.05,
      detail: migration >= 0.1
        ? `Digit personalities favour ${def.label} (${migration.toFixed(2)})`
        : `Digit-personality migration weak (${migration.toFixed(2)})`,
    },
    {
      name: "Structural digits",
      major: true,
      ok: structuralSupport,
      detail: structuralSupport
        ? `Structural digits ${structural.join(",")} support ${def.label}`
        : `Structural digit conflict: ${structural.map((d) => `${d}(${personalities[d].state})`).join(", ")}`,
    },
    {
      name: "Historical agreement",
      major: false,
      ok: historical >= 0.55,
      detail: `100/1000-tick agreement ${(historical * 100).toFixed(0)}%`,
    },
    {
      name: "Fluctuation",
      major: true,
      ok: fluctuation <= 0.5,
      detail: `Fluctuation ${(fluctuation * 100).toFixed(0)}%`,
    },
    {
      name: "Market health",
      major: false,
      ok: psy.health >= 55,
      detail: `Health ${psy.health.toFixed(0)} (${psy.healthLabel})`,
    },
    {
      name: "Persistence",
      major: false,
      ok: persistenceTicks >= 2,
      detail: `${persistenceTicks} consecutive winning ticks`,
    },
    // Scanner mindset gate — MAJOR for every OVER/UNDER contract, but soft:
    // "ok" when ≥5/7 sub-conditions align (score ≥ 0.6). Mindset is the
    // reasoning backdrop for every signal, not a hard checklist.
    ...(mindset.applicable
      ? [{
          name: "Scanner mindset",
          major: true,
          ok: mindset.score >= 0.6,
          detail: mindset.detail,
        } as Gate]
      : []),
  ];

  const majorFails = gates.filter((g) => g.major && !g.ok);
  const passed = gates.filter((g) => g.ok).length;
  const firstMajorFail = majorFails[0]?.name;

  // ── Confidence (each driver capped so no single metric can dominate) ──
  // Caps enforce signal *quality*: a huge edge or persistence streak can't
  // paper over conflicting evidence, and manipulation can't be over-penalised
  // into rejecting a structurally clean setup.
  const cap = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
  let confidence = 50;
  confidence += cap(edge * 380, 14);                // edge cap ±14
  confidence += cap(momentum * 260, 10);            // momentum cap ±10
  confidence += cap(loserSuppression * 160, 8);     // loser suppression cap ±8
  confidence += Math.min(10, persistenceTicks * 1.4); // persistence cap +10
  confidence += cap((psy.health - 60) * 0.25, 8);   // health cap ±8
  confidence -= Math.min(12, psy.manipulation * 0.35); // manipulation cap -12
  confidence += cap(migration * 8, 10);             // migration cap ±10
  confidence += cap((historical - 0.55) * 30, 8);   // historical cap ±8
  confidence -= Math.min(15, fluctuation * 25);     // fluctuation cap -15
  if (hostileLoser !== undefined) confidence -= 18;
  if (!structuralSupport) confidence -= 10;
  // Scanner mindset shapes confidence for the whole OVER/UNDER family.
  if (mindset.applicable) {
    // Symmetric ±10 based on how many sub-conditions align (0..1 → -10..+10).
    confidence += (mindset.score - 0.5) * 20;
  }
  confidence = clamp(confidence);

  // ── Supports & Conflicts (V3 explicit reasoning) ───────────────────
  const supports: string[] = [];
  const conflicts: string[] = [];
  if (winnerStrength > 0.1) supports.push(`Winning group strengthening (${winnerStrength.toFixed(2)})`);
  else if (winnerStrength < -0.1) conflicts.push(`Winning group weakening (${winnerStrength.toFixed(2)})`);
  if (loserStrength < -0.1) supports.push(`Losing group weakening (${loserStrength.toFixed(2)})`);
  else if (loserStrength > 0.1) conflicts.push(`Losing group strengthening (${loserStrength.toFixed(2)})`);
  if (migration >= 0.1) supports.push(`Migration favours winning side (${migration.toFixed(2)})`);
  else if (migration <= -0.1) conflicts.push(`Migration favours losing side (${migration.toFixed(2)})`);
  if (structuralSupport) supports.push(`Structural digits ${structural.join(",")} compatible`);
  else conflicts.push(`Structural digit conflict`);
  if (historical >= 0.6) supports.push(`Historical windows agree (${(historical * 100).toFixed(0)}%)`);
  else if (historical < 0.5) conflicts.push(`Historical windows diverge (${(historical * 100).toFixed(0)}%)`);
  if (fluctuation > 0.5) conflicts.push(`High fluctuation (${(fluctuation * 100).toFixed(0)}%)`);
  if (psy.manipulation >= 26) conflicts.push(`Manipulation elevated (${psy.manipulation.toFixed(0)}%)`);
  if (!barConsistent) conflicts.push("Bar behaviour inconsistent with candidate");

  // ── Reasoning bullets (kept for existing UI) ───────────────────────
  const reasons: string[] = [];
  const hotWinners = def.winners.filter((d) => stats.profiles[d].temp === "hot");
  const coldLosers = losers.filter((d) => stats.profiles[d].temp === "cold");
  if (hotWinners.length) reasons.push(`Hot winning digits ${hotWinners.join(", ")} attracting probability`);
  if (coldLosers.length) reasons.push(`Cold losing digits ${coldLosers.join(", ")} remain suppressed`);
  reasons.push(
    `${def.side === "UNDER" ? "Zone A (0-4)" : "Zone B (5-9)"} share ${
      def.side === "UNDER" ? (psy.zoneA * 100).toFixed(0) : (psy.zoneB * 100).toFixed(0)
    }%`,
  );
  if (migration >= 0.1) reasons.push(`Probability migration favours ${def.label} (${migration.toFixed(2)})`);
  reasons.push(`Persistence ${persistenceTicks} · manipulation ${psy.manipulation.toFixed(0)}% · fluctuation ${(fluctuation * 100).toFixed(0)}%`);
  reasons.push(beh.summary);
  supports.slice(0, 3).forEach((s) => reasons.push(`✓ ${s}`));
  conflicts.slice(0, 3).forEach((c) => reasons.push(`✕ ${c}`));

  // ── State machine (V3) ─────────────────────────────────────────────
  let state: VerdictState;
  let rejection: string | null = null;
  const edgeOk = edge >= 0.012;
  const gateContradiction = hostileLoser !== undefined || groupPressure < -0.02 || momentum < -0.02;

  if (fluctuation > 0.6) {
    state = "UNSTABLE";
    rejection = `Reasoning too unstable — fluctuation ${(fluctuation * 100).toFixed(0)}%.`;
  } else if (psy.manipulation >= 32) {
    state = "REJECTED";
    rejection = `Manipulation spike ${psy.manipulation.toFixed(0)}%.`;
  } else if (mindset.applicable && mindset.score < 0.45) {
    // Severe mindset mismatch across the family — block premature signals.
    state = "BUILDING";
    rejection = `Scanner mindset unaligned for ${def.label} — ${mindset.failed[0] ?? "structure not aligned"}.`;
  } else if (!edgeOk && majorFails.length >= 2) {
    state = "REJECTED";
    rejection = hostileLoser !== undefined
      ? `Digit psychology incompatible — digit ${hostileLoser} contradicts ${def.label}.`
      : `No probability edge for ${def.label}.`;
  } else if (edgeOk && gateContradiction) {
    state = "CONFLICT";
    rejection = hostileLoser !== undefined
      ? `Edge exists but digit ${hostileLoser} contradicts ${def.label}.`
      : `Edge exists but trader flow contradicts ${def.label}.`;
  } else if (historical < 0.5 && Math.abs(migration) < 0.15) {
    state = "TRANSITION";
    rejection = `Market in transition — historical windows disagree.`;
  } else if (
    majorFails.length === 0 &&
    confidence >= 78 &&
    persistenceTicks >= 3 &&
    structuralSupport &&
    (!mindset.applicable || mindset.score >= 0.6)   // READY needs solid — not perfect — mindset
  ) {
    state = "READY";
  } else if (majorFails.length === 0 && confidence >= 66) {
    state = "WATCH";
  } else if (edge >= 0 && momentum >= 0) {
    state = "BUILDING";
  } else {
    state = "REJECTED";
    rejection = majorFails.length
      ? `${majorFails[0].detail}.`
      : `Structure not internally coherent for ${def.label}.`;
  }

  // Reasoning trail: expose the scanner mindset check to the UI.
  if (mindset.applicable) {
    if (mindset.pass) supports.push(`Scanner mindset: ${mindset.detail}`);
    else conflicts.push(`Scanner mindset: ${mindset.detail}`);
    reasons.unshift(mindset.pass ? `✓ ${mindset.detail}` : `✕ ${mindset.detail}`);
  }

  const consistency =
    passed * 8 +
    confidence * 0.6 +
    Math.max(0, edge) * 200 +
    migration * 15 +
    (state === "READY" ? 40 : state === "WATCH" ? 15 : 0) -
    fluctuation * 20;

  return {
    id: def.id,
    label: def.label,
    side: def.side,
    barrier: def.barrier,
    state,
    confidence,
    empWinRate,
    recentWinRate,
    theoretical,
    edge,
    momentum,
    persistenceTicks,
    consistency,
    gates,
    reasons,
    rejection,
    supports,
    conflicts,
    gateFailed: firstMajorFail,
    alternativesRejected: [],
  };
}

// ---------------------------------------------------------------------------
// Full market reasoning pipeline + decision layer.
// Pipeline: Data → Health → Manipulation → Persistence → Edge → Psychology →
//   Memory → Contract Reasoning → Compatibility → Fluctuation → Qualification.
// ---------------------------------------------------------------------------
export function analyseMarket(market: string, name: string, ticks: Tick[]): MarketReasoning {
  const stats = digitStatistics(ticks);
  const psychology = marketPsychology(stats, ticks);
  const behaviour = traderBehaviour(stats);
  const personalities = classifyDigits(stats, psychology);

  const memory = computeMemory(stats.digits);
  const historical = historicalAgreement(memory);
  const patternLabel: PatternLabel = classifyPattern(memory, psychology);
  const match = matchPattern(memory, patternLabel);
  // Record only when we have sensible sample.
  if (stats.windowSize >= 200) recordPattern(market, patternLabel, memory);

  // Compute a market-level primary edge for fluctuation history (use OVER2).
  const primaryEdge =
    [3, 4, 5, 6, 7, 8, 9].reduce((a, d) => a + stats.pct[d], 0) - 0.7;
  const fluc = measureFluctuation(market, stats, behaviour, primaryEdge);

  const ctx: ReasoningContext = {
    stats,
    psy: psychology,
    beh: behaviour,
    personalities,
    historical,
    fluctuation: fluc.score,
    patternMatch: match.similarity,
  };

  const verdicts = CONTRACTS.map((c) => evaluateContract(c, ctx));

  // Composite Edge (attached to each verdict for transparency).
  for (const v of verdicts) {
    const def = CONTRACTS.find((c) => c.id === v.id)!;
    const edgeComp = computeEdge({
      empWinRate: v.empWinRate,
      theoretical: v.theoretical,
      recentWinRate: v.recentWinRate,
      persistenceTicks: v.persistenceTicks,
      psy: psychology,
      mem: memory,
      stats,
      fluctuation: fluc.score,
      minSubEdges: 4,
    });
    v.edgeParts = edgeComp.parts;
    // Small confidence bump per passing sub-edge, capped.
    v.confidence = Math.max(0, Math.min(100, v.confidence + Math.min(6, edgeComp.passing)));
    // Silence unused var warning
    void def;
  }

  // Decision engine: recommend the most internally-consistent READY story.
  const ready = verdicts.filter((v) => v.state === "READY").sort((a, b) => b.consistency - a.consistency);
  const best = ready[0] ?? null;
  const headline = [...verdicts].sort((a, b) => b.consistency - a.consistency)[0];

  // Explain why alternative contracts were rejected — attach to best.
  if (best) {
    best.alternativesRejected = verdicts
      .filter((v) => v.id !== best.id)
      .map((v) => ({
        id: v.id,
        label: v.label,
        reason:
          v.rejection ??
          (v.state === "READY"
            ? `also viable but ${(best.consistency - v.consistency).toFixed(1)} less consistent`
            : `state ${v.state} — ${v.gateFailed ?? "insufficient evidence"}`),
      }));
  }

  return {
    market,
    name,
    ticks: ticks.length,
    ready: ticks.length >= 60,
    stats,
    psychology,
    behaviour,
    verdicts,
    best,
    headline,
    digitStates: personalities.map((p) => ({ d: p.d, state: p.state, score: p.score, detail: p.detail })),
    patternLabel,
    patternSimilarity: match.similarity,
    fluctuation: fluc.score,
    fluctuationReasons: fluc.reasons,
  };
}
