import type { Engine, EngineContext, EngineScore } from "../types";

export const marketHealthEngine: Engine = {
  name: "marketHealth",
  evaluate(ctx: EngineContext): EngineScore {
    const f = ctx.features;
    const entropy = ctx.config.features.entropy ? f.entropyNorm : 0.9;
    const distStab = ctx.config.features.distributionStability ? f.distributionStability : 0.8;
    const tickStab = f.tickConsistency;
    const histDev = ctx.config.features.historicalDeviation ? 1 - f.historicalDeviation : 1;
    // Health favours balanced, stable, consistent markets.
    const score = Math.max(0, Math.min(100,
      30 * entropy + 25 * distStab + 20 * tickStab + 25 * histDev,
    ));
    return {
      name: "marketHealth",
      score,
      weight: ctx.config.engineWeights.marketHealth ?? 0,
      features: {
        entropyNorm: f.entropyNorm,
        distributionStability: f.distributionStability,
        tickConsistency: f.tickConsistency,
        historicalDeviation: f.historicalDeviation,
      },
      reasons: [
        `Entropy ${(entropy * 100).toFixed(0)}%`,
        `Stability ${(distStab * 100).toFixed(0)}%`,
        `Tick consistency ${(tickStab * 100).toFixed(0)}%`,
      ],
    };
  },
};

export function healthLabel(score: number): "excellent" | "good" | "average" | "weak" | "avoid" {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "average";
  if (score >= 40) return "weak";
  return "avoid";
}
