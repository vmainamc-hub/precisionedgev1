import type { Engine, EngineContext, EngineScore } from "../types";

export const zoneEngine: Engine = {
  name: "zone",
  evaluate(ctx: EngineContext): EngineScore {
    if (!ctx.config.features.zoneBalance) {
      return { name: "zone", score: 50, weight: ctx.config.engineWeights.zone ?? 0, features: {}, reasons: ["disabled"] };
    }
    const f = ctx.features;
    const dominance = Math.abs(f.zoneA - f.zoneB); // 0..1
    // Zone transitions
    let transitions = 0;
    let prev = -1;
    for (const d of f.digits) {
      const z = d <= 4 ? 0 : 1;
      if (prev !== -1 && z !== prev) transitions++;
      prev = z;
    }
    const rotation = transitions / Math.max(1, f.digits.length - 1);
    const pressure = dominance;
    const score = Math.max(0, Math.min(100, 55 * dominance + 25 * rotation + 20 * pressure + 20));
    return {
      name: "zone",
      score,
      weight: ctx.config.engineWeights.zone ?? 0,
      features: {
        zoneA: f.zoneA,
        zoneB: f.zoneB,
        dominance,
        rotation,
        transitions,
      },
      reasons: [
        `Zone A (0-4) ${(f.zoneA * 100).toFixed(1)}% vs Zone B (5-9) ${(f.zoneB * 100).toFixed(1)}%`,
      ],
    };
  },
};
