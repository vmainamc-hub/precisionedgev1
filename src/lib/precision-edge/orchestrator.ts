// Precision Edge Intelligence Engine — orchestrator.
// Wires the pipeline: features → engines → fusion → recommendation →
// explanation → historical logger. One instance per market.
import type {
  CandidateContract,
  Engine,
  EngineConfig,
  EngineContext,
  EngineOutput,
  Tick,
} from "./types";
import { DEFAULT_CONFIG, mergeConfig } from "./config";
import { RollingStore } from "./rolling-store";
import { extractFeatures } from "./features";
import { getDNA, updateDNA } from "./market-dna";
import { fuseScores } from "./fusion";
import { evaluateCandidates, pickRecommendation } from "./recommendation";
import { buildExplanation } from "./explanation";
import { logOutput } from "./historical-logger";
import { updateSetupState } from "./engines/setup-stability";
import { healthLabel } from "./engines/market-health";

// Registered engines. New engines are appended here or via registerEngine —
// no other file needs to change.
import { digitStatisticsEngine } from "./engines/digit-statistics";
import { probabilityEngine } from "./engines/probability";
import { recoveryEngine } from "./engines/recovery";
import { greenRedEngine } from "./engines/green-red";
import { zoneEngine } from "./engines/zone";
import { psychologyEngine } from "./engines/psychology";
import { contrarianEngine } from "./engines/contrarian";
import { marketHealthEngine } from "./engines/market-health";
import { setupStabilityEngine } from "./engines/setup-stability";

export class PrecisionEdgeEngine {
  readonly market: string;
  private store: RollingStore;
  private config: EngineConfig;
  private engines: Engine[] = [];
  private candidates: CandidateContract[];
  private lastEvaluation = 0;

  constructor(opts: {
    market: string;
    config?: Partial<EngineConfig>;
    engines?: Engine[];
    candidates?: CandidateContract[];
  }) {
    this.market = opts.market;
    this.config = mergeConfig(DEFAULT_CONFIG, opts.config ?? {});
    this.candidates = opts.candidates ?? [];
    const maxWindow = Math.max(...this.config.rollingWindows);
    this.store = new RollingStore(opts.market, maxWindow);
    this.engines = opts.engines ?? [
      digitStatisticsEngine,
      probabilityEngine,
      recoveryEngine,
      greenRedEngine,
      zoneEngine,
      psychologyEngine,
      contrarianEngine,
      marketHealthEngine,
      setupStabilityEngine,
    ];
  }

  /** Register an additional engine at runtime. */
  registerEngine(engine: Engine) {
    if (!this.engines.find((e) => e.name === engine.name)) this.engines.push(engine);
  }

  updateConfig(patch: Partial<EngineConfig>) {
    this.config = mergeConfig(this.config, patch);
  }

  seed(ticks: Tick[]) { this.store.seed(ticks); }
  push(tick: Tick) { this.store.push(tick); }

  /** Rate-limited by config.evaluationFrequencyMs. */
  maybeEvaluate(): EngineOutput | null {
    const now = Date.now();
    if (now - this.lastEvaluation < this.config.evaluationFrequencyMs) return null;
    return this.evaluate();
  }

  evaluate(): EngineOutput {
    this.lastEvaluation = Date.now();
    const cfg = this.config;
    const primaryWindow = cfg.rollingWindows.includes(1000) ? 1000 : cfg.rollingWindows[cfg.rollingWindows.length - 1];
    const dna = getDNA(this.market);
    const features = extractFeatures(this.store.ticks(), primaryWindow, dna);

    const windows: Record<number, Tick[]> = {};
    for (const n of cfg.rollingWindows) windows[n] = this.store.window(n);

    const ctx: EngineContext = {
      market: this.market,
      features,
      windows,
      candidates: this.candidates,
      config: cfg,
      dna,
    };

    const engineScores = this.engines.map((e) => e.evaluate(ctx));
    const marketHealth = engineScores.find((s) => s.name === "marketHealth")?.score ?? 60;
    const recoveryScore = engineScores.find((s) => s.name === "recovery");

    const { edgeScore, appliedWeights } = fuseScores(engineScores, cfg.engineWeights);
    for (const s of engineScores) s.weight = appliedWeights[s.name] ?? 0;

    const candidateEvals = evaluateCandidates(ctx, edgeScore);
    const recommended = pickRecommendation(candidateEvals, edgeScore, cfg.recommendationThreshold);
    const recovery = recommended?.recovery ?? null;
    const setup = updateSetupState(this.market, edgeScore, Date.now(), cfg.persistenceMs, cfg.recommendationThreshold);
    const explanation = buildExplanation(
      engineScores,
      recommended,
      recovery,
      marketHealth,
      edgeScore,
      cfg.recommendationThreshold,
    );

    const confidence = Math.max(0, Math.min(100,
      0.55 * edgeScore + 0.25 * marketHealth + 0.2 * (recommended?.quality ?? 0),
    ));

    const featureContributions: Record<string, number> = {
      entropy: features.entropy,
      entropyNorm: features.entropyNorm,
      greenPct: features.greenPct,
      redPct: features.redPct,
      zoneA: features.zoneA,
      zoneB: features.zoneB,
      momentum: features.momentum,
      acceleration: features.acceleration,
      digitRotation: features.digitRotation,
      distributionStability: features.distributionStability,
      historicalDeviation: features.historicalDeviation,
      tickConsistency: features.tickConsistency,
      velocity: features.velocity,
    };

    const output: EngineOutput = {
      market: this.market,
      timestamp: features.timestamp,
      candidates: candidateEvals,
      recommended,
      recovery,
      setupQuality: recommended?.quality ?? 0,
      confidence,
      marketHealth,
      marketHealthLabel: healthLabel(marketHealth),
      edgeScore,
      state: setup.state,
      ageMs: setup.ageMs,
      trend: setup.trend,
      engineContributions: engineScores,
      featureContributions,
      reasons: explanation.reasons,
      warnings: explanation.warnings,
    };

    // Update DNA + historical log.
    updateDNA(this.market, features, {
      marketHealth,
      recoveryCompatibility: (recoveryScore?.features?.compatibility as number) ?? 60,
      probabilities: Object.fromEntries(candidateEvals.map((c) => [c.candidate.label, c.probability])),
    });
    logOutput(output, cfg.memorySize);
    return output;
  }
}
