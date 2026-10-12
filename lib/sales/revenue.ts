/**
 * Pipeline revenue uses the fixed 0.5% rate for Phase 001.
 * The value is derived on read and is deliberately not persisted.
 */
export function calculateExpectedNetRevenue(
  expectedVolume: number | null,
  probability: number | null,
): number | null {
  if (expectedVolume == null || probability == null) return null;
  return expectedVolume * 0.005 * probability / 100;
}
