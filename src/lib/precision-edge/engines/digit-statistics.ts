import type { Engine, EngineContext, EngineScore } from "../types";

export const digitStatisticsEngine: Engine = {
  name: "digitStatistics",
  evaluate(ctx: EngineContext): EngineScore {
    const f = ctx.features;
    const flags = ctx.config.features;
    const reasons: string[] = [];
    let score = 0, parts = 0;

    if (flags.entropy) {
      // Balanced (high entropy) is neutral; strong imbalance (low entropy) is edge.
      const s = (1 - f.entropyNorm) * 100;
      score += s; parts++;
      reasons.push(`Entropy ${f.entropy.toFixed(2)} bits — ${f.entropyNorm > 0.95 ? "balanced" : "imbalanced"}`);
    }
    if (flags.hotDigits) {
      const dom = f.dominant[0];
      const s = Math.min(100, f.pct[dom] * 400);
      score += s; parts++;
      reasons.push(`Hot digit ${dom} at ${(f.pct[dom] * 100).toFixed(1)}%`);
    }
    if (flags.coldDigits) {
      const w = f.weak[0];
      const gap = 0.1 - f.pct[w];
      score += Math.max(0, Math.min(100, gap * 500)); parts++;
      if (f.missing.length && flags.missingDigits) reasons.push(`Missing digits: ${f.missing.join(",")}`);
    }
    if (flags.digitRotation) {
      const s = f.digitRotation * 100;
      score += s; parts++;
      reasons.push(`Digit rotation ${(f.digitRotation * 100).toFixed(0)}%`);
    }

    const finalScore = parts ? score / parts : 50;
    return {
      name: "digitStatistics",
      score: clamp(finalScore),
      weight: ctx.config.engineWeights.digitStatistics ?? 0,
      features: {
        entropy: f.entropy,
        entropyNorm: f.entropyNorm,
        skewness: f.skewness,
        digitRotation: f.digitRotation,
        dominant: f.dominant.join(","),
        weak: f.weak.join(","),
      },
      reasons,
    };
  },
};

function clamp(n: number) { return Math.max(0, Math.min(100, n)); }
