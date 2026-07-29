const MALAWI_MOBILE_PATTERN = /^(?:\+?265|0)(?:8[0-9]|9[0-9])\d{7}$/;
const SAFE_PHONE_SEPARATORS = /[\s().-]/g;

export function normalizeMalawiPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const compact = value.trim().replace(SAFE_PHONE_SEPARATORS, "");
  if (!MALAWI_MOBILE_PATTERN.test(compact)) return undefined;

  if (compact.startsWith("+265")) return compact;
  if (compact.startsWith("265")) return `+${compact}`;
  return `+265${compact.slice(1)}`;
}

export function maskPhoneNumber(value: string): string {
  if (value.length <= 6) return "[redacted]";
  return `${value.slice(0, 4)}******${value.slice(-3)}`;
}
