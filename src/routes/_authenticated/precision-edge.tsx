import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Brain, Wifi, Activity, Radar, Settings as SettingsIcon, Timer, ShieldOff } from "lucide-react";
import { usePrecisionReasoning } from "@/hooks/usePrecisionReasoning";
import { usePrecisionSettings } from "@/hooks/usePrecisionSettings";
import { BestTradePanel } from "@/components/precision-edge/v2/BestTradePanel";
import { RankingTable } from "@/components/precision-edge/v2/RankingTable";
import { SettingsDrawerV2 } from "@/components/precision-edge/v2/SettingsDrawerV2";
import { JournalPanel } from "@/components/precision-edge/v2/JournalPanel";
import { recordSignal } from "@/lib/precision-edge-v2/journal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/precision-edge")({
  component: PrecisionEdgeV2,
});

function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toISOString().slice(0, 19).replace("T", " ");
}

function useHoldCountdown(holdUntil: number | undefined) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!holdUntil) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((holdUntil - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [holdUntil]);
  return remaining;
}

function PrecisionEdgeV2() {
  const { settings, patch, setWeight, toggleBot, reset } = usePrecisionSettings();
  const scan = usePrecisionReasoning(settings);
  const clock = useUtcClock();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const live = scan.status === "live";

  const held = scan.held;
  const heldMarket =
    held && scan.best?.market === held.market
      ? scan.best
      : held
        ? {
            market: held.market,
            name: held.name,
            ticks: 0,
            ready: true,
            stats: {} as never,
            psychology: held.psychology,
            behaviour: held.behaviour,
            verdicts: [held.verdict],
            best: held.verdict,
            headline: held.verdict,
          }
        : null;
  const remaining = useHoldCountdown(held?.holdUntil);

  // Auto-record a READY signal into the journal (idempotent by market+contract+time).
  useEffect(() => {
    if (!held || held.verdict.state !== "READY") return;
    recordSignal({
      market: held.market,
      contract: held.verdict.label,
      confidence: held.verdict.confidence,
      health: held.psychology.health,
      edge: held.verdict.edge,
      manipulation: held.psychology.manipulation,
      persistence: held.verdict.persistenceTicks,
      supports: held.verdict.supports ?? [],
      conflicts: held.verdict.conflicts ?? [],
      reasoning: (held.verdict.reasons ?? []).slice(0, 3).join(" · "),
    });
  }, [held?.market, held?.verdict.label, held?.createdAt]);


  return (
    <div className="min-h-screen grid-bg text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/40 glass">
        <div className="max-w-[1800px] mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/app/dashboard"
              className="grid place-items-center w-9 h-9 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--bull)]/15 border border-[var(--bull)]/30 text-[var(--bull)]">
              <Brain className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Precision Edge V2
              </div>
              <h1 className="text-lg font-semibold text-foreground leading-tight truncate">
                Market Reasoning Intelligence Terminal
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">API</span>
              <span className={`flex items-center gap-1 font-semibold ${live ? "text-[var(--bull)]" : "text-warn"}`}>
                <Wifi className={`w-3.5 h-3.5 ${live ? "pulse-dot" : ""}`} />
                {live ? "LIVE" : scan.status.toUpperCase()}
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs tabular text-muted-foreground">
              <Activity className="w-3.5 h-3.5" /> {scan.latencyMs || "—"}ms
            </div>
            <div className="hidden lg:block rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs tabular text-muted-foreground">
              {clock} UTC
            </div>
            <button
              onClick={scan.scanNow}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-[var(--bull)]/40 bg-[var(--bull)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--bull)] hover:bg-[var(--bull)]/20 transition-colors",
                scan.scanning && "neon-border",
              )}
            >
              <Radar className={cn("w-3.5 h-3.5", scan.scanning && "animate-spin")} /> Scan
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <SettingsIcon className="w-3.5 h-3.5" /> Settings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-5 py-5 space-y-5">
        {held && (
          <div className="rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/[0.06] px-4 py-2 flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Timer className="w-3.5 h-3.5 text-[var(--primary)]" />
              Signal locked · lasts at least {settings.minHoldSeconds}s
            </div>
            <div className="text-xs tabular text-[var(--primary)] font-semibold">
              {remaining}s remaining
            </div>
          </div>
        )}

        <BestTradePanel best={heldMarket} />
        {!held && scan.markets.length > 0 && (
          <NoTradeBanner scan={scan} settings={settings} />
        )}
        <RankingTable scan={scan} />
        <JournalPanel />
      </main>


      <SettingsDrawerV2
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        patch={patch}
        setWeight={setWeight}
        toggleBot={toggleBot}
        reset={reset}
      />
    </div>
  );
}

function NoTradeBanner({
  scan,
  settings,
}: {
  scan: ReturnType<typeof usePrecisionReasoning>;
  settings: ReturnType<typeof usePrecisionSettings>["settings"];
}) {
  // Surface the analyst's honest verdict when no hypothesis survives scrutiny.
  // Aggregate the dominant contradictions across every evaluated market so the
  // operator sees WHY nothing was recommended and what would unlock a trade.
  const reasons = new Map<string, number>();
  let bestConfidence = 0;
  let worstManip = 0;
  for (const m of scan.markets) {
    worstManip = Math.max(worstManip, m.psychology.manipulation);
    for (const v of m.verdicts) {
      bestConfidence = Math.max(bestConfidence, v.confidence);
      for (const c of v.conflicts ?? []) reasons.set(c, (reasons.get(c) ?? 0) + 1);
      if (v.rejection) reasons.set(v.rejection, (reasons.get(v.rejection) ?? 0) + 1);
    }
  }
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r]) => r);
  const waitingFor: string[] = [];
  if (worstManip >= settings.maxManipulation) waitingFor.push(`Manipulation below ${settings.maxManipulation}%`);
  if (bestConfidence < settings.threshold) waitingFor.push(`Confidence above ${settings.threshold}`);
  waitingFor.push(`Winning streak ≥ ${settings.minPersistenceTicks} ticks`);
  waitingFor.push(`Edge ≥ ${settings.minEdgePct.toFixed(1)}% over fair`);

  return (
    <div className="rounded-xl border border-warn/30 bg-warn/[0.05] p-4">
      <div className="flex items-center gap-2 text-warn">
        <ShieldOff className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-[0.25em]">No trade</span>
      </div>
      <p className="mt-2 text-sm text-foreground leading-relaxed">
        No hypothesis survives the analyst's evidence review. The engine is comfortable
        waiting — its objective is decision quality, not signal frequency.
      </p>
      {top.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Contradictions
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {top.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Waiting for
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {waitingFor.map((r, i) => <li key={i}>✓ {r}</li>)}
        </ul>
      </div>
    </div>
  );
}
