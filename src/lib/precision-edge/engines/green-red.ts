import type { Engine, EngineContext, EngineScore } from "../types";

export const greenRedEngine: Engine = {
  name: "greenRed",
  evaluate(ctx: EngineContext): EngineScore {
    if (!ctx.config.features.greenRed) {
      return { name: "greenRed", score: 50, weight: ctx.config.engineWeights.greenRed ?? 0, features: {}, reasons: ["disabled"] };
    }
    const f = ctx.features;
    const imbalance = Math.abs(f.greenPct - 0.5) * 2; // 0..1
    const mom = ctx.config.features.momentum ? Math.abs(f.momentum) : 0;
    const acc = ctx.config.features.acceleration ? Math.abs(f.acceleration) : 0;
    const score = Math.max(0, Math.min(100, 40 * imbalance + 35 * mom + 25 * acc + 20));
    return {
      name: "greenRed",
      score,
      weight: ctx.config.engineWeights.greenRed ?? 0,
      features: {
        greenPct: f.greenPct,
        redPct: f.redPct,
        momentum: f.momentum,
        acceleration: f.acceleration,
        direction: f.momentum > 0 ? "up" : f.momentum < 0 ? "down" : "flat",
      },
      reasons: [
        `Green ${(f.greenPct * 100).toFixed(1)}% / Red ${(f.redPct * 100).toFixed(1)}%`,
        `Momentum ${f.momentum.toFixed(2)}, acceleration ${f.acceleration.toFixed(2)}`,
      ],
    };
  },
};
