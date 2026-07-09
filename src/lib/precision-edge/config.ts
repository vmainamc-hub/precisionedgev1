// Default configuration for the Precision Edge engine.
// Every value is overridable at runtime — never hardcode in engines.
import type { EngineConfig } from "./types";

export const DEFAULT_CONFIG: EngineConfig = {
  engineWeights: {
    digitStatistics: 15,
    probability: 20,
    recovery: 12,
    greenRed: 8,
    zone: 8,
    psychology: 8,
    contrarian: 8,
    marketHealth: 12,
    setupStability: 9,
  },
  featureWeights: {
    digitRotation: 1,
    entropy: 1,
    missingDigits: 1,
    hotDigits: 1,
    coldDigits: 1,
    winningPercentage: 1.5,
    losingPercentage: 1,
    crowdingHeuristic: 1,
    recoveryCompatibility: 1.2,
    zoneBalance: 1,
    momentum: 1,
    acceleration: 0.8,
    greenRed: 1,
    distributionStability: 1,
    historicalDeviation: 1,
  },
  features: {
    digitRotation: true,
    entropy: true,
    missingDigits: true,
    hotDigits: true,
    coldDigits: true,
    winningPercentage: true,
    losingPercentage: true,
    crowdingHeuristic: true,
    recoveryCompatibility: true,
    zoneBalance: true,
    momentum: true,
    acceleration: true,
    greenRed: true,
    distributionStability: true,
    historicalDeviation: true,
  },
  recommendationThreshold: 75,
  persistenceMs: 6000,
  rollingWindows: [20, 50, 100, 200, 500, 1000, 5000],
  memorySize: 2000,
  notificationThreshold: 85,
  autoAnalysis: true,
  evaluationFrequencyMs: 500,
};

/** Normalise engine weights so they sum to 100. Pure. */
export function normaliseWeights(weights: Record<string, number>): Record<string, number> {
  const sum = Object.values(weights).reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0) return { ...weights };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(weights)) out[k] = (Math.max(0, v) / sum) * 100;
  return out;
}

export function mergeConfig(base: EngineConfig, patch: Partial<EngineConfig>): EngineConfig {
  return {
    ...base,
    ...patch,
    engineWeights: { ...base.engineWeights, ...(patch.engineWeights ?? {}) },
    featureWeights: { ...base.featureWeights, ...(patch.featureWeights ?? {}) },
    features: { ...base.features, ...(patch.features ?? {}) },
    rollingWindows: patch.rollingWindows ?? base.rollingWindows,
  };
}
