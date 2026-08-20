import { type ReactNode, Suspense, lazy } from 'react';
import { BarcodeEntry } from './BarcodeEntry';
import { Button } from './ui';

/**
 * The ZXing decoder is by far the heaviest dependency and is only needed once
 * the camera is actually opened, so it is split out of the initial bundle.
 * The typed entry below it is *not* lazy: it has to work even when the camera
 * is unavailable or the decoder chunk is still on its way.
 */
const BarcodeScanner = lazy(() =>
  import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
);

export function LazyBarcodeScanner({
  onResult,
  onManual,
}: {
  onResult: (code: string) => void;
  onManual: () => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <Suspense
        fallback={
          <p className="py-10 text-center text-[14px] text-muted">
            Scanner wird geladen…
          </p>
        }
      >
        <BarcodeScanner onResult={onResult} />
      </Suspense>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[12px] text-faint">oder eintippen</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <BarcodeEntry onSubmit={onResult} />

      <Button variant="ghost" onClick={onManual}>
        Ohne Barcode weiter
      </Button>
    </div>
  );
}
