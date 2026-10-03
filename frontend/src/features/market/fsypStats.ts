/** Mean score across the newest ``count`` form entries (empty → null). */
export function averageLastPerformances(
  recent: readonly number[],
  count = 3,
): number | null {
  const values = recent.slice(0, count).filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function formatScoreAverage(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}
