import { Panel } from "../Panel";
import { Radar, TrendingUp, TrendingDown, Clock, ShieldAlert, Play } from "lucide-react";
import type { RiseFallSignal } from "@/hooks/useRiseFallScan";

export function RiseFallScanner({
  signals, status, scan, lastScanAt, scannedCount, readyCount,
}: {
  signals: RiseFallSignal[];
  status: string;
  scan: () => void;
  lastScanAt: number | null;
  scannedCount: number;
  readyCount: number;
}) {
  const tradable = signals.filter((s) => s.decision !== "WAIT" && s.risk !== "High");
  const waits = signals.filter((s) => s.decision === "WAIT");
  return (
    <Panel title="Precision Edge · Rise/Fall Multi-Market Scanner" subtitle="Weighted engine · MTF confirmation · confidence-gated" accent="cyan">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-[var(--accent)]">
          <Radar size={14} className={status === "live" ? "pulse-dot" : ""} />
          <span className="text-xs uppercase tracking-wider font-semibold">{status} · {readyCount}/{scannedCount} markets ready</span>
        </div>
        <div className="flex items-center gap-2">
          {lastScanAt && (
            <span className="text-[10px] opacity-70 flex items-center gap-1"><Clock size={10} /> {new Date(lastScanAt).toLocaleTimeString()}</span>
          )}
          <button
            onClick={scan}
            disabled={readyCount === 0}
            className="h-8 px-3 rounded-md bg-[var(--neon)]/15 hover:bg-[var(--neon)]/25 border border-[var(--neon)]/40 text-xs text-[var(--neon)] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={12} /> SCAN
          </button>
        </div>
      </div>

      {signals.length === 0 ? (
        <p className="text-[11px] text-foreground/60">Press SCAN once markets are ready. The engine evaluates trend, momentum, MACD, streak & MTF agreement, then ranks every market.</p>
      ) : (
        <>
          <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1.5">Actionable ({tradable.length})</div>
          {tradable.length === 0 && (
            <p className="text-[11px] text-foreground/60 mb-2">All markets are WAIT or High-risk. Stand aside.</p>
          )}
          <ul className="space-y-1.5">
            {tradable.slice(0, 6).map((s, i) => (
              <SignalRow key={s.symbol} sig={s} rank={i + 1} />
            ))}
          </ul>

          {waits.length > 0 && (
            <div className="mt-3 border-t border-border/30 pt-2">
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Wait / avoid ({waits.length})</div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {waits.slice(0, 8).map((s) => (
                  <li key={s.symbol} className="flex items-center justify-between text-[10px] tabular opacity-75">
                    <span>{s.name}</span>
                    <span className="opacity-70">{s.reasons[0]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-[9px] opacity-50 leading-snug">
        Note: uses live tick data across a 3-window MTF proxy (100/300/1000 ticks). Deriv WS does not expose OHLC candles; this scanner weighs trend/RSI/MACD/streak/volatility/anomaly, not the full 40+ indicator spec.
      </p>
    </Panel>
  );
}

function SignalRow({ sig, rank }: { sig: RiseFallSignal; rank: number }) {
  const isRise = sig.decision === "BUY RISE";
  const color = isRise ? "text-[var(--bull)] border-[var(--bull)]/40 bg-[var(--bull)]/8"
    : "text-[var(--bear)] border-[var(--bear)]/40 bg-[var(--bear)]/8";
  const Icon = isRise ? TrendingUp : TrendingDown;
  const riskColor = sig.risk === "Low" ? "text-[var(--bull)]" : sig.risk === "Medium" ? "text-[var(--warn)]" : "text-[var(--bear)]";
  return (
    <li className={`rounded-md border px-2.5 py-1.5 ${color}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="opacity-60">#{rank}</span>
          <Icon size={12} />
          {sig.name} · {sig.decision}
        </span>
        <span className="tabular text-[10px]">{sig.confidence}% conf</span>
      </div>
      <div className="mt-0.5 grid grid-cols-3 gap-x-3 text-[10px] tabular text-foreground/75">
        <span>Rise {sig.riseScore} / Fall {sig.fallScore}</span>
        <span>RSI {sig.rsi.toFixed(0)} · Vol {sig.volatility.toFixed(2)}%</span>
        <span className={riskColor}><ShieldAlert size={9} className="inline mr-0.5" />{sig.risk} risk</span>
      </div>
      <div className="mt-0.5 text-[10px] opacity-80">
        {sig.reasons.slice(0, 3).join(" · ")}
      </div>
    </li>
  );
}
