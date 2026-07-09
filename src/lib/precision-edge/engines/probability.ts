import type { Engine, EngineContext, EngineScore } from "../types";
import { contractWinProb, defaultCandidates } from "../probability";

export const probabilityEngine: Engine = {
  name: "probability",
  evaluate(ctx: EngineContext): EngineScore {
    const w100 = ctx.windows[100] ?? ctx.features.ticks;
    const w1000 = ctx.windows[1000] ?? w100;
    const candidates = ctx.candidates.length ? ctx.candidates : defaultCandidates();
    let best = { label: "", prob: 0, hist: 0, dev: 0 };
    for (const c of candidates) {
      const prob = contractWinProb(w100, c);
      const hist = contractWinProb(w1000, c);
      if (prob > best.prob) best = { label: c.label, prob, hist, dev: prob - hist };
    }
    const wp = ctx.config.features.winningPercentage ? best.prob * 100 : 50;
    const lp = ctx.config.features.losingPercentage ? (1 - (1 - best.prob)) * 100 : 50;
    const momentum = 50 + best.dev * 200; // -0.25 dev → 0, +0.25 dev → 100
    const stability = 100 - Math.abs(best.dev) * 400;
    const score = clamp(0.5 * wp + 0.2 * momentum + 0.2 * Math.max(0, stability) + 0.1 * lp);
    return {
      name: "probability",
      score,
      weight: ctx.config.engineWeights.probability ?? 0,
      features: {
        bestCandidate: best.label,
        rollingProbability: best.prob,
        historicalProbability: best.hist,
        deviation: best.dev,
      },
      reasons: [
        `${best.label} rolling ${(best.prob * 100).toFixed(1)}% vs historical ${(best.hist * 100).toFixed(1)}%`,
      ],
    };
  },
};

function clamp(n: number) { return Math.max(0, Math.min(100, n)); }
