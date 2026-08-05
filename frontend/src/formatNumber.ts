// Counts are shown next to scientific notation such as 4.59e-13, so they use one fixed
// convention rather than the visitor's locale: a German browser would otherwise render
// 21,050 tested terms as "21.050", which reads as twenty-one in the same table.
const COUNT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCount(value: number): string {
  return Number.isFinite(value) ? COUNT_FORMAT.format(value) : "—";
}
