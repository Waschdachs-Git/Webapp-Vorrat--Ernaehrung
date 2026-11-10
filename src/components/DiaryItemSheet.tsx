import { type ReactNode, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { Button, Field, Input } from './ui';
import { deleteDiaryItem, updateDiaryItemAmount } from '@/lib/actions';
import type { DiaryItem } from '@/db/types';
import { formatAmount, unitLabel, parseDecimal } from '@/lib/format';

export interface DiaryItemRef {
  entryId: string;
  itemIndex: number;
  item: DiaryItem;
}

/**
 * Edit or remove a single logged item. Amounts that came from stock are
 * corrected in the inventory as well, so diary and stock stay in sync.
 */
export function DiaryItemSheet({
  target,
  onClose,
}: {
  target: DiaryItemRef | null;
  onClose: () => void;
}): ReactNode {
  const [amount, setAmount] = useState<string>(
    target ? String(target.item.amount) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromStock =
    target?.item.sourceType === 'inventory' && target.item.refId !== undefined;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      console.error('Tagebuch ändern fehlgeschlagen:', err);
      setError('Konnte nicht gespeichert werden. Bitte noch einmal versuchen.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!target) return;
    const next = parseDecimal(amount);
    if (!(next > 0)) return;
    void run(() => updateDiaryItemAmount(target.entryId, target.itemIndex, next));
  };

  const remove = () => {
    if (!target) return;
    void run(() => deleteDiaryItem(target.entryId, target.itemIndex));
  };

  return (
    <BottomSheet
      open={!!target}
      onClose={onClose}
      title={target?.item.name ?? 'Eintrag'}
    >
      {target && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">
            Aktuell gebucht: {formatAmount(target.item.amount, target.item.unit)} ·{' '}
            {Math.round(target.item.kcal)} kcal
          </p>

          <Field
            label={`Menge (${unitLabel(target.item.unit)})`}
            hint={
              fromStock
                ? 'Die Differenz wird im Vorrat mit verrechnet.'
                : undefined
            }
          >
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>

          <Button
            block
            onClick={save}
            disabled={busy || !(parseDecimal(amount) > 0)}
          >
            Menge speichern
          </Button>

          {error && (
            <p role="alert" className="text-[13.5px] text-danger">
              {error}
            </p>
          )}

          <Button variant="danger" block onClick={remove} disabled={busy}>
            <Trash2 size={16} /> Eintrag löschen
            {fromStock ? ' (zurück in den Vorrat)' : ''}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
