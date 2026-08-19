export function formatMwk(value: number | string | undefined): string {
  const numericValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numericValue)) return "MWK 0";
  return `MWK ${numericValue.toLocaleString("en-MW")}`;
}
