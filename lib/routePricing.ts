function normalizeRouteText(value: string | undefined): string {
  if (!value) return "";

  return value
    .trim()
    .replace(/[→—–−]/g, "-")
    .replace(/\s*[-–—−]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRoutePriceLines(routesText: string): Record<string, number> {
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

function parseRouteObjects(routeObjects: unknown): Record<string, number> {
  const prices: Record<string, number> = {};

  if (!Array.isArray(routeObjects)) return prices;

  for (const item of routeObjects) {
    if (!isRecord(item)) continue;

    const routeName = String(item.route_name ?? item.name ?? item.route ?? "").trim();
    const fareValue = item.fare ?? item.price ?? item.amount;
    const numericPrice = typeof fareValue === "number" ? fareValue : Number(String(fareValue ?? "").replace(/[^0-9.-]/g, ""));

    if (routeName && Number.isFinite(numericPrice) && numericPrice > 0) {
      prices[normalizeRouteText(routeName)] = numericPrice;
    }
  }

  return prices;
}

export function parseRoutePrices(routesTextOrSettings: string | Record<string, unknown> | null | undefined): Record<string, number> {
  if (!routesTextOrSettings) return {};

  if (typeof routesTextOrSettings === "string") {
    return parseRoutePriceLines(routesTextOrSettings);
  }

  const settings = isRecord(routesTextOrSettings.settings) ? routesTextOrSettings.settings : routesTextOrSettings;
  const prices: Record<string, number> = {
    ...parseRoutePriceLines(typeof settings.routes === "string" ? settings.routes : ""),
    ...parseRouteObjects(settings.route_objects),
  };

  return prices;
}

export function resolveRouteFare(destination: string | undefined, routesText: string | Record<string, unknown> | undefined, fallback = 5000): number {
  return resolveRouteFareIfAvailable(destination, routesText) ?? fallback;
}

export function resolveRouteFareIfAvailable(destination: string | undefined, routesText: string | Record<string, unknown> | undefined): number | undefined {
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
