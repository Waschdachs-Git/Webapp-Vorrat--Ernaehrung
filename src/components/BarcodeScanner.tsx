import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import type { IScannerControls } from '@zxing/browser';
import { CameraOff } from 'lucide-react';

/**
 * Camera barcode scanner (EAN/UPC) using @zxing/browser + getUserMedia.
 * Requires HTTPS (or localhost). Calls onResult once with the decoded text.
 */
export function BarcodeScanner({
  onResult,
}: {
  onResult: (code: string) => void;
}): ReactNode {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && !cancelled) {
          cancelled = true;
          controls?.stop();
          onResult(result.getText());
        }
      })
      .then((c) => {
        controls = c;
        if (cancelled) c.stop();
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? 'Kamera nicht verfügbar. Auf dem iPad ist HTTPS nötig.'
            : 'Kamera konnte nicht gestartet werden.',
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onResult]);

  if (error) {
    // The manual barcode entry sits in the wrapper, so it stays usable here.
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface-2 px-4 py-6 text-center">
        <CameraOff className="text-faint" size={26} />
        <p className="text-[14px] text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover"
          playsInline
          muted
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-24 w-3/4 rounded-xl border-2 border-white/80" />
        </div>
      </div>
      <p className="text-center text-[13px] text-muted">
        Barcode in den Rahmen halten
      </p>
    </div>
  );
}
