import type { Engine, EngineContext, EngineScore } from "../types";

// Heuristic behavioural attraction — inferred from observable statistics,
// NOT from real trader positions.
export const psychologyEngine: Engine = {
  name: "psychology",
  evaluate(ctx: EngineContext): EngineScore {
    if (!ctx.config.features.crowdingHeuristic) {
      return { name: "psychology", score: 50, weight: ctx.config.engineWeights.psychology ?? 0, features: {}, reasons: ["disabled"] };
    }
    const f = ctx.features;
    // Attraction spikes when distribution is visually skewed toward one zone,
    // one parity, or shows extended streaks — retail eyes chase these patterns.
    const zoneAttraction = Math.abs(f.zoneA - 0.5) * 2;
    const oddEvenAttraction = Math.abs(f.oddPct - 0.5) * 2;
    const visualAttraction = Math.min(1, f.pct[f.dominant[0]] * 5);
    const temptation = 0.4 * zoneAttraction + 0.3 * oddEvenAttraction + 0.3 * visualAttraction;
    const bias = f.momentum;
    const crowding = Math.min(1, temptation + Math.abs(bias) * 0.2);
    // Higher crowding lowers our confidence — contrarian bias — but returns a
    // score describing psychological pressure itself.
    const score = 100 - crowding * 60;
    return {
      name: "psychology",
      score: Math.max(0, Math.min(100, score)),
      weight: ctx.config.engineWeights.psychology ?? 0,
      features: { crowding, temptation, bias, zoneAttraction, oddEvenAttraction, visualAttraction },
      reasons: [
        `Crowding ${(crowding * 100).toFixed(0)}%`,
        `Temptation ${(temptation * 100).toFixed(0)}%`,
      ],
    };
  },
};
