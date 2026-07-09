// Shared live market stream + scanner context used by every /app/* page.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useDerivStream, DERIV_SYMBOLS, type DerivSymbol } from "@/hooks/useDerivStream";
import { useMultiVolatilityScan } from "@/hooks/useMultiVolatilityScan";
import { useAdvancedOverUnderScan } from "@/hooks/useAdvancedOverUnderScan";
import { useRiseFallScan } from "@/hooks/useRiseFallScan";
import type { Tick } from "@/lib/analytics";

type Ctx = {
  symbol: string;
  setSymbol: (s: string) => void;
  running: boolean;
  setRunning: (r: boolean) => void;
  windowSize: number;
  setWindowSize: (n: number) => void;
  threshold: number;
  setThreshold: (n: number) => void;
  ticks: Tick[];
  view: Tick[];
  status: string;
  error: string | null;
  scan: ReturnType<typeof useMultiVolatilityScan>;
  advScan: ReturnType<typeof useAdvancedOverUnderScan>;
  rfScan: ReturnType<typeof useRiseFallScan>;
  symbols: DerivSymbol[];
};

const StreamCtx = createContext<Ctx | null>(null);

export function StreamProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState("R_100");
  const [running, setRunning] = useState(true);
  const [windowSize, setWindowSize] = useState(1000);
  const [threshold, setThreshold] = useState(5);
  const deriv = useDerivStream(symbol, running);
  const scan = useMultiVolatilityScan(running);
  const advScan = useAdvancedOverUnderScan(running);
  const rfScan = useRiseFallScan(running);
  const view = useMemo(() => deriv.ticks.slice(-windowSize), [deriv.ticks, windowSize]);

  const value: Ctx = {
    symbol, setSymbol, running, setRunning, windowSize, setWindowSize, threshold, setThreshold,
    ticks: deriv.ticks, view, status: deriv.status, error: deriv.error,
    scan, advScan, rfScan, symbols: DERIV_SYMBOLS,
  };
  return <StreamCtx.Provider value={value}>{children}</StreamCtx.Provider>;
}

export function useStream() {
  const v = useContext(StreamCtx);
  if (!v) throw new Error("useStream must be used inside StreamProvider");
  return v;
}
