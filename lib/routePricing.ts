function normalizeRouteText(value: string | undefined): string {
  if (!value) return "";

  return value
    .trim()
    .replace(/[→—–−]/g, "-")
    .replace(/\s*[-–—−]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function parseRoutePrices(routesText: string): Record<string, number> {
  const prices: Record<string, number> = {};

  if (!routesText || typeof routesText !== "string") return prices;

  for (const line of routesText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const route = normalizeRouteText(trimmed.slice(0, separatorIndex));
    const rawPrice = trimmed.slice(separatorIndex + 1).trim();
    const numericPrice = Number(rawPrice.replace(/[^0-9.-]/g, ""));

    if (route && Number.isFinite(numericPrice) && numericPrice > 0) {
      prices[route] = numericPrice;
    }
  }

  return prices;
}

export function resolveRouteFare(destination: string | undefined, routesText: string | undefined, fallback = 5000): number {
  return resolveRouteFareIfAvailable(destination, routesText) ?? fallback;
}

export function resolveRouteFareIfAvailable(destination: string | undefined, routesText: string | undefined): number | undefined {
  const prices = parseRoutePrices(routesText || "");
  const normalizedDestination = normalizeRouteText(destination);

  if (!normalizedDestination) return undefined;

  if (prices[normalizedDestination] != null) return prices[normalizedDestination];

  const destTokens = normalizedDestination.split(/\s|->|-/).filter(Boolean);

  for (const [route, price] of Object.entries(prices)) {
    if (route === normalizedDestination) return price;
  }

  for (const [route, price] of Object.entries(prices)) {
    const routeTokens = route.split(/\s|->|-/).filter(Boolean);
    const allMatch = destTokens.every((t) => routeTokens.includes(t));
    if (allMatch) return price;
  }

  for (const [route, price] of Object.entries(prices)) {
    if (route.includes(normalizedDestination) || normalizedDestination.includes(route)) return price;
  }

  return undefined;
}

export function formatMwk(value: number | string | undefined): string {
  const numericValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numericValue)) return "MWK 0";
  return `MWK ${numericValue.toLocaleString("en-MW")}`;
}
