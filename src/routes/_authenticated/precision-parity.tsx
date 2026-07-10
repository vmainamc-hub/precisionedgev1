import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Brain, Wifi, Activity, Radar, Settings as SettingsIcon,
  ShieldOff, Sparkles, TrendingUp, Layers, GitBranch,
} from "lucide-react";
import { usePrecisionParity } from "@/hooks/usePrecisionParity";
import { DEFAULT_PARITY_SETTINGS, type ParitySettings } from "@/lib/precision-parity/engine";
import type { MarketParityReport } from "@/lib/precision-parity/types";
import { Panel, Bar } from "@/components/Panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/precision-parity")({
  component: PrecisionParity,
});

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now.toISOString().slice(0, 19).replace("T", " ");
}

const STORAGE_KEY = "precision-parity-settings-v1";
function loadSettings(): ParitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PARITY_SETTINGS;
    return { ...DEFAULT_PARITY_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_PARITY_SETTINGS; }
}

function PrecisionParity() {
  const [settings, setSettings] = useState<ParitySettings>(() =>
    typeof window === "undefined" ? DEFAULT_PARITY_SETTINGS : loadSettings(),
  );
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);
  const patch = (p: Partial<ParitySettings>) => setSettings((s) => ({ ...s, ...p }));

  const scan = usePrecisionParity(settings);
  const clock = useClock();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const live = scan.status === "live";
  const held = scan.held;

  return (
    <div className="min-h-screen grid-bg text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/40 glass">
        <div className="max-w-[1800px] mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/precision-edge" className="grid place-items-center w-9 h-9 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors" aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Precision Parity AI</div>
              <h1 className="text-lg font-semibold text-foreground leading-tight truncate">Even / Odd Intelligence Terminal</h1>
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
              <Activity className="w-3.5 h-3.5" /> {scan.feedsReady}/{scan.feedsTotal}
            </div>
            <div className="hidden lg:block rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs tabular text-muted-foreground">
              {clock} UTC
            </div>
            <button onClick={scan.scanNow} className={cn(
              "flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors",
              scan.scanning && "neon-border",
            )}>
              <Radar className={cn("w-3.5 h-3.5", scan.scanning && "animate-spin")} /> Scan
            </button>
            <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <SettingsIcon className="w-3.5 h-3.5" /> Settings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-5 py-5 space-y-5">
        {held ? <RecommendationCard held={held} /> : <NoTradeBanner scan={scan} settings={settings} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MarketList scan={scan} />
          <SignalHistory history={scan.history} />
        </div>

        {scan.best && <ReasoningPanel report={scan.best} />}
      </main>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} patch={patch} reset={() => setSettings(DEFAULT_PARITY_SETTINGS)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function RecommendationCard({ held }: { held: NonNullable<ReturnType<typeof usePrecisionParity>["held"]> }) {
  const isEven = held.contract === "BUY_EVEN";
  const tone = isEven ? "var(--bull)" : "var(--accent)";
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: `color-mix(in oklab, ${tone} 40%, transparent)`, background: `color-mix(in oklab, ${tone} 8%, transparent)` }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Active recommendation</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular" style={{ color: `hsl(var(--foreground))` }}>{isEven ? "BUY EVEN" : "BUY ODD"}</span>
            <span className="text-sm text-muted-foreground">on {held.name}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Confidence</div>
          <div className="text-3xl font-bold tabular" style={{ color: tone }}>{held.confidence.toFixed(0)}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-1">Reasoning</div>
        <ul className="space-y-1 text-sm text-foreground/90">
          {held.reasoning.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}

function NoTradeBanner({ scan, settings }: { scan: ReturnType<typeof usePrecisionParity>; settings: ParitySettings }) {
  const reasons = new Map<string, number>();
  for (const m of scan.markets) for (const r of m.verdict.reasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r]) => r);
  return (
    <div className="rounded-xl border border-warn/30 bg-warn/[0.05] p-4">
      <div className="flex items-center gap-2 text-warn">
        <ShieldOff className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-[0.25em]">No trade</span>
      </div>
      <p className="mt-2 text-sm text-foreground leading-relaxed">
        No parity hypothesis currently survives the required evidence review. The engine prefers waiting — decision quality over signal frequency.
      </p>
      {top.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Most common reason across markets</div>
          <ul className="space-y-1 text-xs text-muted-foreground">{top.map((r, i) => <li key={i}>• {r}</li>)}</ul>
        </div>
      )}
      <div className="mt-3 text-[11px] text-muted-foreground">
        Waiting for: confidence ≥ {settings.minConfidence}, manipulation &lt; {settings.maxManipulation}%, contradiction &lt; {settings.maxContradiction}%, persistence ≥ {settings.minPersistenceTicks} ticks.
      </div>
    </div>
  );
}

function MarketList({ scan }: { scan: ReturnType<typeof usePrecisionParity> }) {
  const ranked = [...scan.markets].sort((a, b) => b.verdict.confidence - a.verdict.confidence);
  return (
    <Panel title="Market list" subtitle="Live parity monitor" accent="cyan">
      <div className="max-h-[420px] overflow-y-auto -mx-4">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/40">
              <th className="text-left px-4 py-2">Market</th>
              <th className="text-left px-2 py-2">Regime</th>
              <th className="text-right px-2 py-2">Even%</th>
              <th className="text-right px-2 py-2">Conf</th>
              <th className="text-right px-4 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((m) => {
              const ev = (m.windows[100]?.evenPct ?? 0.5) * 100;
              const isEven = m.verdict.recommendation === "BUY_EVEN";
              const isOdd = m.verdict.recommendation === "BUY_ODD";
              return (
                <tr key={m.market} className="border-b border-border/20">
                  <td className="px-4 py-2 font-medium truncate max-w-[180px]">{m.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{m.regime}</td>
                  <td className="px-2 py-2 text-right tabular">{ev.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right tabular font-semibold">{m.verdict.confidence.toFixed(0)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-semibold",
                      m.verdict.state === "READY" && isEven && "bg-[var(--bull)]/15 text-[var(--bull)]",
                      m.verdict.state === "READY" && isOdd && "bg-[var(--accent)]/15 text-[var(--accent)]",
                      m.verdict.state === "BUILDING" && "bg-warn/15 text-warn",
                      m.verdict.state === "MONITORING" && "bg-secondary text-muted-foreground",
                      m.verdict.state === "REJECTED" && "bg-bear/15 text-bear",
                    )}>
                      {m.verdict.state === "READY" ? (isEven ? "EVEN" : "ODD") : m.verdict.state}
                    </span>
                  </td>
                </tr>
              );
            })}
            {ranked.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Buffering ticks…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SignalHistory({ history }: { history: ReturnType<typeof usePrecisionParity>["history"] }) {
  return (
    <Panel title="Signal history" subtitle="Historical recommendations (session)" accent="magenta">
      <div className="max-h-[420px] overflow-y-auto space-y-2">
        {history.length === 0 && <div className="text-xs text-muted-foreground">No signals fired yet in this session.</div>}
        {history.map((h, i) => {
          const isEven = h.contract === "BUY_EVEN";
          return (
            <div key={i} className="rounded-lg border border-border/40 bg-secondary/20 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", isEven ? "bg-[var(--bull)]/15 text-[var(--bull)]" : "bg-[var(--accent)]/15 text-[var(--accent)]")}>
                    {isEven ? "EVEN" : "ODD"}
                  </span>
                  <span className="font-medium">{h.name}</span>
                </div>
                <span className="tabular text-muted-foreground">{h.confidence.toFixed(0)} · {new Date(h.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ReasoningPanel({ report }: { report: MarketParityReport }) {
  const tr = report.transitions.find((t) => t.window === 100) ?? report.transitions[0];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Panel title="Regime" subtitle={`${report.name}`} accent="cyan">
        <div className="space-y-2 text-xs">
          <Row label="Market regime" value={report.regime} />
          <Row label="Hidden regime" value={report.hiddenRegime} />
          <Row label="Manipulation" value={`${report.manipulation.toFixed(0)}%`} />
          <Row label="Fluctuation" value={`${report.fluctuation.toFixed(0)}%`} />
          <Row label="Crowding" value={`${report.crowding.toFixed(0)}%`} />
          <Row label="Historical similarity" value={`${(report.historicalSimilarity * 100).toFixed(0)}%`} />
        </div>
      </Panel>

      <Panel title="Transition matrix" subtitle="First-order Markov · 100t" accent="magenta">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Trans label="P(E→E)" v={tr.pEE} />
          <Trans label="P(E→O)" v={tr.pEO} />
          <Trans label="P(O→E)" v={tr.pOE} />
          <Trans label="P(O→O)" v={tr.pOO} />
        </div>
        <div className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Second-order P(next=Even)</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {(["EE","EO","OE","OO"] as const).map((k) => (
            <div key={k} className="rounded-md border border-border/40 bg-secondary/20 p-2 text-center">
              <div className="text-[10px] text-muted-foreground">{k}</div>
              <div className="tabular font-semibold">{(report.secondOrder.pEvenAfter[k] * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Bar dashboard" subtitle="Green / Red digit intelligence" accent="amber">
        <div className="space-y-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Green bar</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular text-[var(--bull)]">d{report.greenBar.digit}</span>
              <span className="text-muted-foreground">{report.greenBar.parity} · {report.greenBar.zone}</span>
              <span className="ml-auto tabular">{(report.greenBar.pct * 100).toFixed(1)}%</span>
            </div>
            <Bar value={report.greenBar.pct * 100 * 6} tone="bull" />
            <div className="text-[10px] text-muted-foreground mt-1">persistence {report.greenBar.persistence}t · velocity {(report.greenBar.velocity * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Red bar</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular text-bear">d{report.redBar.digit}</span>
              <span className="text-muted-foreground">{report.redBar.parity} · {report.redBar.zone}</span>
              <span className="ml-auto tabular">{(report.redBar.pct * 100).toFixed(1)}%</span>
            </div>
            <Bar value={report.redBar.pct * 100 * 6} tone="bear" />
          </div>
        </div>
      </Panel>

      <Panel title="Rolling parity windows" subtitle="20 · 50 · 100 · 200 · 500 · 1000" accent="cyan" className="lg:col-span-2">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          {[20,50,100,200,500,1000].map((w) => {
            const s = report.windows[w];
            if (!s) return null;
            return (
              <div key={w} className="rounded-md border border-border/40 bg-secondary/20 p-2">
                <div className="text-[10px] text-muted-foreground">{w}t · n={s.n}</div>
                <div className="mt-1 flex justify-between tabular"><span className="text-[var(--bull)]">E {(s.evenPct * 100).toFixed(1)}%</span><span className="text-[var(--accent)]">O {(s.oddPct * 100).toFixed(1)}%</span></div>
                <div className="text-[10px] text-muted-foreground mt-1">H={s.entropy.toFixed(3)}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Contradictions" subtitle="Evidence opposing the winning hypothesis" accent="magenta">
        <div className="space-y-2 text-xs">
          {report.verdict.hypotheses
            .sort((a, b) => b.confidence - a.confidence)[0]
            .conflicts.slice(0, 6).map((c, i) => (
              <div key={i} className="text-muted-foreground">− {c.detail}</div>
            ))}
          {report.verdict.hypotheses[0].conflicts.length === 0 && (
            <div className="text-muted-foreground">No material contradictions detected.</div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/20 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

function Trans({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-md border border-border/40 bg-secondary/20 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="tabular font-semibold">{(v * 100).toFixed(1)}%</div>
      <Bar value={v * 100} tone="neon" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function SettingsDrawer({ open, onOpenChange, settings, patch, reset }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: ParitySettings;
  patch: (p: Partial<ParitySettings>) => void;
  reset: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Precision Parity settings</SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-5 text-sm">
          <SwitchRow label="Auto scan" value={settings.autoScan} onChange={(v) => patch({ autoScan: v })} />
          <SwitchRow label="Require mature setup" value={settings.requireMature} onChange={(v) => patch({ requireMature: v })} />
          <SliderRow label="Min confidence" value={settings.minConfidence} min={50} max={95} onChange={(v) => patch({ minConfidence: v })} suffix="" />
          <SliderRow label="Manipulation cap" value={settings.maxManipulation} min={10} max={80} onChange={(v) => patch({ maxManipulation: v })} suffix="%" />
          <SliderRow label="Contradiction tolerance" value={settings.maxContradiction} min={10} max={80} onChange={(v) => patch({ maxContradiction: v })} suffix="%" />
          <SliderRow label="Min persistence (ticks)" value={settings.minPersistenceTicks} min={1} max={20} onChange={(v) => patch({ minPersistenceTicks: v })} suffix="t" />
          <SliderRow label="Signal hold" value={settings.minHoldSeconds} min={5} max={120} onChange={(v) => patch({ minHoldSeconds: v })} suffix="s" />
          <SliderRow label="Refresh (ms)" value={settings.refreshMs} min={500} max={5000} step={100} onChange={(v) => patch({ refreshMs: v })} suffix="ms" />
          <SliderRow label="Minimum ticks" value={settings.minTicks} min={100} max={1000} step={50} onChange={(v) => patch({ minTicks: v })} suffix="t" />
          <button onClick={reset} className="w-full rounded-lg border border-border/50 bg-secondary/30 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
            Reset to defaults
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/20 px-3 py-2">
      <span className="text-xs">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-semibold">{value}{suffix}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}