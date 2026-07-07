export function parseRoutePrices(routesText: string): Record<string, number> {
  const prices: Record<string, number> = {};

  if (!routesText || typeof routesText !== "string") return prices;

  for (const line of routesText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const route = trimmed.slice(0, separatorIndex).trim();
    const rawPrice = trimmed.slice(separatorIndex + 1).trim();
    const numericPrice = Number(rawPrice.replace(/[^0-9.-]/g, ""));

    if (route && Number.isFinite(numericPrice) && numericPrice > 0) {
      prices[route] = numericPrice;
    }
  }

  return prices;
}

export function resolveRouteFare(destination: string | undefined, routesText: string | undefined, fallback = 5000): number {
  const normalizedDestination = destination?.trim();
  if (!normalizedDestination) return fallback;

  const prices = parseRoutePrices(routesText || "");

  if (prices[normalizedDestination] != null) return prices[normalizedDestination];

  const normalizedLookup = normalizedDestination.toLowerCase();
  for (const [route, price] of Object.entries(prices)) {
    if (route.toLowerCase() === normalizedLookup) return price;
    if (route.toLowerCase().includes(normalizedLookup) || normalizedLookup.includes(route.toLowerCase())) return price;
  }

  return fallback;
}

export function formatMwk(value: number | string | undefined): string {
  const numericValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numericValue)) return "MWK 0";
  return `MWK ${numericValue.toLocaleString("en-MW")}`;
}
