import { type ReactNode, Suspense, lazy } from 'react';

/**
 * The ZXing decoder is by far the heaviest dependency and is only needed once
 * the camera is actually opened, so it is split out of the initial bundle.
 */
const BarcodeScanner = lazy(() =>
  import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
);

export function LazyBarcodeScanner(props: {
  onResult: (code: string) => void;
  onManual: () => void;
}): ReactNode {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-[14px] text-muted">
          Scanner wird geladen…
        </p>
      }
    >
      <BarcodeScanner {...props} />
    </Suspense>
  );
}
