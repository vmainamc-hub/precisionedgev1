import { createFileRoute } from "@tanstack/react-router";
import { useStream } from "@/lib/stream-context";
import { RiseFallScanner } from "@/components/modules/RiseFallScanner";
import { RiseFallModule } from "@/components/modules/RiseFallModule";

export const Route = createFileRoute("/_authenticated/app/scanner/rise-fall")({
  component: RiseFallPage,
});

function RiseFallPage() {
  const s = useStream();
  return (
    <div className="space-y-4">
      <RiseFallScanner
        signals={s.rfScan.signals}
        status={s.rfScan.status}
        scan={s.rfScan.scan}
        lastScanAt={s.rfScan.lastScanAt}
        scannedCount={s.rfScan.scannedCount}
        readyCount={s.rfScan.readyCount}
      />
      {s.view.length > 0 && <RiseFallModule ticks={s.view} />}
    </div>
  );
}
