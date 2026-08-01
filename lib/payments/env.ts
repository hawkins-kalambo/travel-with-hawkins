import "server-only";

// Server-only PayChangu configuration. Validated lazily — only when a
// PayChangu operation actually runs — so importing this module (directly or
// transitively) never breaks an unrelated build, static generation, or page
// render just because the env vars aren't set yet in that environment.

export type PayChanguEnv = {
  secretKey: string;
  webhookSecret: string;
  baseUrl: string;
};

const DEFAULT_BASE_URL = "https://api.paychangu.com";

export class PayChanguConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayChanguConfigError";
  }
}

export function getPayChanguEnv(): PayChanguEnv {
  const secretKey = process.env.PAYCHANGU_SECRET_KEY;
  const webhookSecret = process.env.PAYCHANGU_WEBHOOK_SECRET;
  const baseUrl = process.env.PAYCHANGU_BASE_URL?.trim() || DEFAULT_BASE_URL;

  const missing: string[] = [];
  if (!secretKey || !secretKey.trim()) missing.push("PAYCHANGU_SECRET_KEY");
  if (!webhookSecret || !webhookSecret.trim()) missing.push("PAYCHANGU_WEBHOOK_SECRET");

  if (missing.length > 0) {
    // Deliberately does not include any env var *values* — only names.
    throw new PayChanguConfigError(
      `PayChangu is not configured: missing ${missing.join(", ")}. Set these as server-only environment variables (never NEXT_PUBLIC_*).`
    );
  }

  return {
    secretKey: secretKey!.trim(),
    webhookSecret: webhookSecret!.trim(),
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}
