import { type ReactNode, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { Button, Field, Input } from './ui';
import { deleteDiaryItem, updateDiaryItemAmount } from '@/lib/actions';
import type { DiaryItem } from '@/db/types';
import { formatAmount, unitLabel } from '@/lib/format';

export interface DiaryItemRef {
  entryId: number;
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

  const fromStock =
    target?.item.sourceType === 'inventory' && target.item.refId !== undefined;

  const save = async () => {
    if (!target) return;
    const next = parseFloat(amount);
    if (!(next > 0)) return;
    setBusy(true);
    await updateDiaryItemAmount(target.entryId, target.itemIndex, next);
    setBusy(false);
    onClose();
  };

  const remove = async () => {
    if (!target) return;
    setBusy(true);
    await deleteDiaryItem(target.entryId, target.itemIndex);
    setBusy(false);
    onClose();
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
            disabled={busy || !(parseFloat(amount) > 0)}
          >
            Menge speichern
          </Button>

          <Button variant="danger" block onClick={remove} disabled={busy}>
            <Trash2 size={16} /> Eintrag löschen
            {fromStock ? ' (zurück in den Vorrat)' : ''}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
