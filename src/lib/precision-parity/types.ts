// Precision Parity AI — types.
// Institutional-grade Even/Odd intelligence. Independent of Precision Edge.

export type Parity = "EVEN" | "ODD";
export type ParityContract = "BUY_EVEN" | "BUY_ODD";

export type MarketRegime =
  | "STABLE"
  | "TRENDING"
  | "OSCILLATING"
  | "COMPRESSED"
  | "EXPANDING"
  | "MANIPULATED"
  | "CHAOTIC"
  | "RECOVERY"
  | "NEUTRAL";

export type HiddenRegime =
  | "BALANCED"
  | "EVEN_DOMINANCE"
  | "ODD_DOMINANCE"
  | "ALTERNATING"
  | "REVERSAL_BUILDING"
  | "COMPRESSION"
  | "EXPANSION"
  | "UNCERTAIN";

export type MaturityState =
  | "EMERGING"
  | "BUILDING"
  | "MATURE"
  | "PEAK"
  | "WEAKENING"
  | "EXPIRED";

export interface WindowStat {
  n: number;
  evenPct: number;
  oddPct: number;
  entropy: number;
}

export interface TransitionMatrix {
  window: number;
  eeCount: number;
  eoCount: number;
  oeCount: number;
  ooCount: number;
  pEE: number;
  pEO: number;
  pOE: number;
  pOO: number;
  sample: number;
}

export interface SecondOrderMatrix {
  window: number;
  // last two-parities -> P(next EVEN)
  pEvenAfter: Record<"EE" | "EO" | "OE" | "OO", number>;
  counts: Record<"EE" | "EO" | "OE" | "OO", number>;
}

export interface BarSnapshot {
  digit: number;
  parity: Parity;
  zone: "LOWER" | "UPPER";
  pct: number;         // 0..1 in recent window
  velocity: number;    // recent - baseline (-1..1)
  persistence: number; // ticks since it became green/red bar
}

export interface DigitPsychology {
  hot: number;
  cold: number;
  mostAppearing: number;
  secondMostAppearing: number;
  leastAppearing: number;
  secondLeastAppearing: number;
  rising: number;   // most increasing
  falling: number;  // most decreasing
  rotationSpeed: number; // 0..1
  clustering: number;    // 0..1
  zoneA: number;
  zoneB: number;
}

export interface Evidence {
  engine: string;
  supports: ParityContract | "NEUTRAL";
  strength: number; // 0..1
  detail: string;
}

export interface HypothesisEvaluation {
  contract: ParityContract;
  confidence: number;        // 0..100 Bayesian
  supports: Evidence[];
  conflicts: Evidence[];
  contradictionScore: number; // 0..100
  maturity: MaturityState;
  persistenceTicks: number;
  reasoning: string[];
}

export interface ParityVerdict {
  recommendation: ParityContract | "NO_TRADE";
  state: "READY" | "BUILDING" | "MONITORING" | "REJECTED";
  confidence: number;
  reasons: string[];
  hypotheses: HypothesisEvaluation[];
}

export interface MarketParityReport {
  market: string;
  name: string;
  ticks: number;
  regime: MarketRegime;
  hiddenRegime: HiddenRegime;
  windows: Record<number, WindowStat>;
  transitions: TransitionMatrix[];
  secondOrder: SecondOrderMatrix;
  greenBar: BarSnapshot;
  redBar: BarSnapshot;
  digitPsychology: DigitPsychology;
  manipulation: number;    // 0..100
  fluctuation: number;     // 0..100
  crowding: number;        // 0..100
  historicalSimilarity: number; // 0..1
  verdict: ParityVerdict;
}