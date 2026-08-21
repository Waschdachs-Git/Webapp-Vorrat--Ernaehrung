import { type ReactNode, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Input } from './ui';

/** EAN-8, UPC-12, EAN-13 and a little slack for other GTIN lengths. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 14;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Type a barcode instead of scanning it. Deliberately lives outside the lazily
 * loaded scanner so it still works when the camera is unavailable (no HTTPS,
 * permission denied) or while the decoder chunk is still loading.
 */
export function BarcodeEntry({
  onSubmit,
  disabled,
}: {
  onSubmit: (code: string) => void;
  disabled?: boolean;
}): ReactNode {
  const [value, setValue] = useState('');
  const code = digitsOnly(value);
  const valid = code.length >= MIN_DIGITS && code.length <= MAX_DIGITS;
  const tooShort = code.length > 0 && !valid;

  const submit = () => {
    if (!valid || disabled) return;
    onSubmit(code);
    setValue('');
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          // Numeric keypad on the iPad; type="text" keeps leading zeros.
          inputMode="numeric"
          autoComplete="off"
          placeholder="Barcode eintippen, z. B. 4008400301457"
          aria-label="Barcode eintippen"
        />
        <Button
          onClick={submit}
          disabled={!valid || disabled}
          className="px-3"
          aria-label="Barcode suchen"
        >
          <Search size={18} />
        </Button>
      </div>
      {tooShort && (
        <p className="mt-1.5 text-[12px] text-faint">
          {code.length} von mindestens {MIN_DIGITS} Ziffern.
        </p>
      )}
    </div>
  );
}
