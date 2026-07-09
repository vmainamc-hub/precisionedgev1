import type { Engine, EngineContext, EngineScore, SetupState } from "../types";

interface SetupTracker {
  since: number;
  lastScore: number;
  history: number[];
  state: SetupState;
}

const trackers = new Map<string, SetupTracker>();

export function resetSetupTrackers() { trackers.clear(); }

export function trackerSnapshot(key: string) {
  const t = trackers.get(key);
  if (!t) return null;
  return { ...t, history: [...t.history] };
}

export function updateSetupState(
  key: string,
  edgeScore: number,
  now: number,
  persistenceMs: number,
  threshold: number,
): { state: SetupState; ageMs: number; trend: "up" | "down" | "flat" } {
  let t = trackers.get(key);
  if (!t) {
    t = { since: now, lastScore: edgeScore, history: [edgeScore], state: "emerging" };
    trackers.set(key, t);
  } else {
    t.history.push(edgeScore);
    if (t.history.length > 60) t.history.shift();
  }
  const ageMs = now - t.since;
  const rising = t.history.length >= 3 && edgeScore > t.history[t.history.length - 3];
  const falling = t.history.length >= 3 && edgeScore < t.history[t.history.length - 3];

  let state: SetupState;
  if (edgeScore < threshold * 0.6) state = "expired";
  else if (edgeScore < threshold * 0.85) state = "weakening";
  else if (edgeScore >= threshold && ageMs >= persistenceMs) state = rising ? "strengthening" : "confirmed";
  else if (edgeScore >= threshold * 0.9) state = "building";
  else state = "emerging";

  if (state === "expired") {
    trackers.delete(key);
  } else {
    t.state = state;
    t.lastScore = edgeScore;
  }
  return { state, ageMs, trend: rising ? "up" : falling ? "down" : "flat" };
}

export const setupStabilityEngine: Engine = {
  name: "setupStability",
  evaluate(ctx: EngineContext): EngineScore {
    // The stability score is derived from tracker history for this market.
    const t = trackers.get(ctx.market);
    if (!t || t.history.length < 3) {
      return {
        name: "setupStability",
        score: 50,
        weight: ctx.config.engineWeights.setupStability ?? 0,
        features: { age: 0, samples: t?.history.length ?? 0 },
        reasons: ["Setup just emerged"],
      };
    }
    const mean = t.history.reduce((a, b) => a + b, 0) / t.history.length;
    const variance = t.history.reduce((a, b) => a + (b - mean) ** 2, 0) / t.history.length;
    const stability = 1 / (1 + Math.sqrt(variance) / 20);
    const persistence = Math.min(1, (Date.now() - t.since) / (ctx.config.persistenceMs * 2));
    const score = Math.max(0, Math.min(100, 60 * stability * 100 / 100 + 40 * persistence * 100 / 100));
    return {
      name: "setupStability",
      score,
      weight: ctx.config.engineWeights.setupStability ?? 0,
      features: {
        state: t.state,
        age: Date.now() - t.since,
        meanScore: mean,
        variance,
        samples: t.history.length,
      },
      reasons: [`State ${t.state}, mean edge ${mean.toFixed(1)}, samples ${t.history.length}`],
    };
  },
};
