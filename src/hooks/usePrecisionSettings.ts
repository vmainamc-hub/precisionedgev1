// Persisted settings for Precision Edge V2. All controls surfaced in the
// Settings drawer so operators can tune the engine without touching code.
import { useCallback, useEffect, useState } from "react";

export interface EngineWeights {
  digitStatistics: number;
  psychology: number;
  contrarian: number;
  barMomentum: number;
  digitZones: number;
  recoveryFit: number;
  botCompatibility: number;
  persistence: number;
  marketHealth: number;
}

export type ContractKey = "UNDER6" | "UNDER7" | "UNDER8" | "OVER1" | "OVER2" | "OVER3";

export interface PrecisionSettings {
  threshold: number;              // minimum confidence for a signal (0-100)
  refreshMs: number;              // scan cadence
  lookbackTicks: number;          // ticks retained for reasoning
  minMarketHealth: number;        // 0-100
  minPersistence: number;         // 0-100 (scaled ticks)
  minStability: number;           // 0-100 (min consistency)
  minBotCompatibility: number;    // 0-100
  minZoneDigits: number;          // consecutive same-zone digits
  hysteresis: number;             // switch delta
  autoScan: boolean;
  onlyEnabledBot: boolean;
  entryHorizon: number;           // seconds
  minHoldSeconds: number;         // min lifetime of a signal
  enabledBots: Record<ContractKey, boolean>;
  weights: EngineWeights;
  // ── V3 reasoning controls ──────────────────────────────────────────
  fluctuationTolerance: number;   // 0..1
  minSubEdges: number;            // 0..7
  historicalAgreementMin: number; // 0..1
  migrationStabilityMin: number;  // 0..1
  patternSimilarityBoost: number; // 0..1
  // ── Adjustable signal-quality caps (V3.5) ───────────────────────────
  // Hard gates the analyst must satisfy before a signal can fire.
  maxManipulation: number;        // reject when psy.manipulation ≥ this (0-100)
  minEdgePct: number;             // reject when contract edge < this (percentage points, e.g. 1.2 = 1.2%)
  minPersistenceTicks: number;    // reject when trailing winning streak < this
}

export const CONTRACT_LABELS: Record<ContractKey, string> = {
  UNDER6: "Under 6",
  UNDER7: "Under 7",
  UNDER8: "Under 8",
  OVER1: "Over 1",
  OVER2: "Over 2",
  OVER3: "Over 3",
};

export const ENGINE_LABELS: { key: keyof EngineWeights; label: string }[] = [
  { key: "digitStatistics", label: "Digit Statistics" },
  { key: "psychology", label: "Market Psychology" },
  { key: "contrarian", label: "Contrarian" },
  { key: "barMomentum", label: "Bar Momentum" },
  { key: "digitZones", label: "Digit Zones" },
  { key: "recoveryFit", label: "Recovery Fit" },
  { key: "botCompatibility", label: "Bot Compatibility" },
  { key: "persistence", label: "Persistence" },
  { key: "marketHealth", label: "Market Health" },
];

export const ENTRY_HORIZONS = [10, 20, 30, 60, 90, 120];

export const DEFAULT_SETTINGS: PrecisionSettings = {
  threshold: 82,               // was 78 — require higher confidence
  refreshMs: 2000,
  lookbackTicks: 1000,
  minMarketHealth: 65,         // was 60
  minPersistence: 40,          // was 30 — demand more trailing agreement
  minStability: 62,            // was 55
  minBotCompatibility: 65,     // was 60
  minZoneDigits: 3,
  hysteresis: 8,               // was 6 — sticker signals, fewer flips
  autoScan: true,
  onlyEnabledBot: true,
  entryHorizon: 60,
  minHoldSeconds: 60,
  enabledBots: {
    UNDER6: true,
    UNDER7: true,
    UNDER8: true,
    OVER1: true,
    OVER2: true,
    OVER3: true,
  },
  weights: {
    digitStatistics: 14,
    psychology: 12,
    contrarian: 10,
    barMomentum: 12,           // slight bump — tracks scanner momentum
    digitZones: 10,
    recoveryFit: 8,
    botCompatibility: 8,
    persistence: 14,           // bump — scanner exhaustion/build takes ticks
    marketHealth: 12,
  },
  fluctuationTolerance: 0.30,  // was 0.35 — reject noisier markets
  minSubEdges: 5,              // was 4
  historicalAgreementMin: 0.58,
  migrationStabilityMin: 0.55,
  patternSimilarityBoost: 0.15,
  maxManipulation: 26,
  minEdgePct: 1.2,
  minPersistenceTicks: 2,
};

const STORAGE_KEY = "precision-edge-v2-settings";

export function weightPct(w: EngineWeights, key: keyof EngineWeights): number {
  const sum = ENGINE_LABELS.reduce((a, { key: k }) => a + Math.max(0, w[k]), 0);
  if (sum <= 0) return 0;
  return Math.round((Math.max(0, w[key]) / sum) * 100);
}

export function usePrecisionSettings() {
  const [settings, setSettings] = useState<PrecisionSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          enabledBots: { ...DEFAULT_SETTINGS.enabledBots, ...(parsed.enabledBots ?? {}) },
          weights: { ...DEFAULT_SETTINGS.weights, ...(parsed.weights ?? {}) },
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const patch = useCallback(
    (p: Partial<PrecisionSettings>) => setSettings((s) => ({ ...s, ...p })),
    [],
  );
  const setWeight = useCallback(
    (key: keyof EngineWeights, v: number) =>
      setSettings((s) => ({ ...s, weights: { ...s.weights, [key]: v } })),
    [],
  );
  const toggleBot = useCallback(
    (key: ContractKey, v: boolean) =>
      setSettings((s) => ({ ...s, enabledBots: { ...s.enabledBots, [key]: v } })),
    [],
  );

  return { settings, setSettings, patch, setWeight, toggleBot, reset };
}
