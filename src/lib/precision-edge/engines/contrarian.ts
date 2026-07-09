import type { Engine, EngineContext, EngineScore } from "../types";

export const contrarianEngine: Engine = {
  name: "contrarian",
  evaluate(ctx: EngineContext): EngineScore {
    const f = ctx.features;
    const digitImbalance = Math.max(...f.pct) - Math.min(...f.pct);
    const zoneImbalance = Math.abs(f.zoneA - f.zoneB);
    const grImbalance = Math.abs(f.greenPct - f.redPct);
    // Streak behaviour
    let streak = 1;
    for (let i = f.digits.length - 2; i >= 0; i--) {
      const a = f.digits[i] % 2, b = f.digits[i + 1] % 2;
      if (a === b) streak++; else break;
    }
    const streakFactor = Math.min(1, streak / 10);
    const crowded = 0.35 * digitImbalance + 0.25 * zoneImbalance + 0.2 * grImbalance + 0.2 * streakFactor;
    // Contrarian score: higher when market looks *balanced* enough that the
    // contrarian trade has room; lower when it's already crowded.
    const score = Math.max(0, Math.min(100, (1 - crowded) * 100));
    return {
      name: "contrarian",
      score,
      weight: ctx.config.engineWeights.contrarian ?? 0,
      features: { digitImbalance, zoneImbalance, greenRedImbalance: grImbalance, streak, crowded },
      reasons: [
        `Crowding heuristic ${(crowded * 100).toFixed(0)}%`,
        `Parity streak ${streak}`,
      ],
    };
  },
};
