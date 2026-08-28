export function normalizeWhatsAppId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const digits = value.trim().replace(/^\+/, "").replace(/\D/g, "");
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return undefined;
  return `+${digits}`;
}

export function maskWhatsAppId(value: string): string {
  return value.length > 7 ? `${value.slice(0, 4)}******${value.slice(-3)}` : "[redacted]";
}
