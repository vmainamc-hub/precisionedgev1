import type { CandidateContract, Engine, EngineContext, EngineScore, RecoveryPlan } from "../types";
import { contractWinProb } from "../probability";

// Predefined recovery relationships. Recovery contract must be strictly safer
// (wider win range) than primary contract.
const RECOVERY_MAP: Array<{ primary: CandidateContract; recovery: CandidateContract }> = [
  { primary: { type: "UNDER", barrier: 7, label: "Under 7" }, recovery: { type: "UNDER", barrier: 5, label: "Under 5" } },
  { primary: { type: "UNDER", barrier: 8, label: "Under 8" }, recovery: { type: "UNDER", barrier: 7, label: "Under 7" } },
  { primary: { type: "OVER",  barrier: 2, label: "Over 2"  }, recovery: { type: "OVER",  barrier: 4, label: "Over 4"  } },
  { primary: { type: "OVER",  barrier: 1, label: "Over 1"  }, recovery: { type: "OVER",  barrier: 2, label: "Over 2"  } },
];

export function findRecovery(primary: CandidateContract, ticks: import("../types").Tick[]): RecoveryPlan | null {
  const match = RECOVERY_MAP.find(
    (r) => r.primary.type === primary.type && r.primary.barrier === primary.barrier,
  );
  if (!match) return null;
  const pProb = contractWinProb(ticks, match.primary);
  const rProb = contractWinProb(ticks, match.recovery);
  const compatibility = Math.max(0, Math.min(100, (rProb - pProb) * 500 + 60));
  const quality = Math.max(0, Math.min(100, rProb * 100));
  return { primary: match.primary, recovery: match.recovery, compatibility, probability: rProb, quality };
}

export const recoveryEngine: Engine = {
  name: "recovery",
  evaluate(ctx: EngineContext): EngineScore {
    if (!ctx.config.features.recoveryCompatibility) {
      return { name: "recovery", score: 50, weight: ctx.config.engineWeights.recovery ?? 0, features: {}, reasons: ["disabled"] };
    }
    const ticks = ctx.windows[500] ?? ctx.features.ticks;
    let best: RecoveryPlan | null = null;
    for (const pair of RECOVERY_MAP) {
      const plan = findRecovery(pair.primary, ticks);
      if (plan && (!best || plan.quality > best.quality)) best = plan;
    }
    const score = best ? 0.6 * best.quality + 0.4 * best.compatibility : 40;
    return {
      name: "recovery",
      score: Math.max(0, Math.min(100, score)),
      weight: ctx.config.engineWeights.recovery ?? 0,
      features: best
        ? {
            primary: best.primary.label,
            recovery: best.recovery.label,
            compatibility: best.compatibility,
            probability: best.probability,
            quality: best.quality,
          }
        : { available: false },
      reasons: best
        ? [`${best.primary.label} → ${best.recovery.label} recovery @ ${(best.probability * 100).toFixed(1)}%`]
        : ["No recovery pair matched"],
    };
  },
};
