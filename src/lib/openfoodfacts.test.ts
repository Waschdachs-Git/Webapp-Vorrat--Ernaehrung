import { describe, expect, it } from 'vitest';
import { parsePackageSize } from './openfoodfacts';

describe('parsePackageSize', () => {
  it.each([
    ['500 g', { amount: 500, unit: 'g' }],
    ['250g', { amount: 250, unit: 'g' }],
    ['1kg', { amount: 1000, unit: 'g' }],
    ['1 l', { amount: 1000, unit: 'ml' }],
    ['1,5 l', { amount: 1500, unit: 'ml' }],
    ['0,33 l', { amount: 330, unit: 'ml' }],
    ['50 cl', { amount: 500, unit: 'ml' }],
    ['6 x 125 g', { amount: 750, unit: 'g' }],
    ['6x1,5l', { amount: 9000, unit: 'ml' }],
    ['10 Stück', { amount: 10, unit: 'pcs' }],
    ['500 g ℮', { amount: 500, unit: 'g' }],
  ])('%s', (label, expected) => {
    expect(parsePackageSize(label)).toEqual(expected);
  });

  it('falls back to the normalised quantity', () => {
    expect(parsePackageSize('Packung', 400, 'g')).toEqual({ amount: 400, unit: 'g' });
    expect(parsePackageSize(undefined, '750', 'ml')).toEqual({ amount: 750, unit: 'ml' });
  });

  it('gives up on what it cannot read', () => {
    expect(parsePackageSize('')).toBeUndefined();
    expect(parsePackageSize('M 10 Stück', 10)).toBeUndefined();
    expect(parsePackageSize('eine Dose')).toBeUndefined();
  });
});
