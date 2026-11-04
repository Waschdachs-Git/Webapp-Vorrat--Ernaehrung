/**
 * Loose name match between a stock item and a recipe ingredient or shopping
 * entry: "Reis" matches "Reis Langkorn Parboiled" and vice versa. Deliberately
 * fuzzy – product names from barcodes rarely equal the plain ingredient name.
 */
export function namesMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}
