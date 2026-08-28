import "server-only";

type WebhookConfig = { verifyToken: string; appSecret: string; enabled: boolean };
type SendConfig = { accessToken: string; phoneNumberId: string; apiVersion: string; enabled: boolean };
type AccountConfig = { wabaId: string; phoneNumberId: string };

export type WhatsAppAiProviderName = "groq" | "compatible";
type AiConfig = { provider: WhatsAppAiProviderName; endpoint: string; apiKey: string; model: string };

export class WhatsAppConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`WhatsApp is not configured: missing ${missing.join(", ")}`);
    this.missing = missing;
    this.name = "WhatsAppConfigError";
  }
}

function enabled(): boolean {
  return process.env.WHATSAPP_BOT_ENABLED?.trim().toLowerCase() === "true";
}

function requireValues(names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) values[name] = value;
    else missing.push(name);
  }
  if (missing.length) throw new WhatsAppConfigError(missing);
  return values;
}

export function getWhatsAppWebhookConfig(): WebhookConfig {
  const values = requireValues(["WHATSAPP_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET"]);
  return { verifyToken: values.WHATSAPP_WEBHOOK_VERIFY_TOKEN, appSecret: values.META_APP_SECRET, enabled: enabled() };
}

export function getWhatsAppSendConfig(): SendConfig {
  const values = requireValues(["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_API_VERSION"]);
  if (!/^v\d+\.\d+$/.test(values.WHATSAPP_GRAPH_API_VERSION)) {
    throw new WhatsAppConfigError(["WHATSAPP_GRAPH_API_VERSION (expected vN.N)"]);
  }
  return {
    accessToken: values.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: values.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: values.WHATSAPP_GRAPH_API_VERSION,
    enabled: enabled(),
  };
}

// The identifiers an inbound webhook event must match to be processed. The
// phone number ID is the Graph API's ID for the sender number — distinct
// from the human-readable phone number and from the WhatsApp Business
// Account ID. Both are obtained from the Meta dashboard; neither is
// hardcoded here.
export function getWhatsAppAccountConfig(): AccountConfig {
  const values = requireValues(["WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_PHONE_NUMBER_ID"]);
  return { wabaId: values.WHATSAPP_BUSINESS_ACCOUNT_ID, phoneNumberId: values.WHATSAPP_PHONE_NUMBER_ID };
}

export function isWhatsAppBotEnabled(): boolean {
  return enabled();
}

// Accept either a base URL (…/openai/v1) or a full chat endpoint
// (…/chat/completions) for WHATSAPP_AI_BASE_URL, and never double up the path.
function normalizeChatEndpoint(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
}

// Optional. Blank WHATSAPP_AI_PROVIDER => AI disabled, returns null. A set
// provider must be "groq" or "compatible" (both use the OpenAI-compatible
// chat-completions shape) and requires base URL, key and model — a set-but-
// incomplete config throws so it is caught at deploy/check time; callers in
// the conversation path degrade to the menu instead (see getWhatsAppAiProvider).
export function getWhatsAppAiConfig(): AiConfig | null {
  const provider = process.env.WHATSAPP_AI_PROVIDER?.trim().toLowerCase();
  if (!provider) return null;
  if (provider !== "groq" && provider !== "compatible") {
    throw new WhatsAppConfigError([`WHATSAPP_AI_PROVIDER (expected "groq" or "compatible")`]);
  }
  const values = requireValues(["WHATSAPP_AI_BASE_URL", "WHATSAPP_AI_API_KEY", "WHATSAPP_AI_MODEL"]);
  return {
    provider,
    endpoint: normalizeChatEndpoint(values.WHATSAPP_AI_BASE_URL),
    apiKey: values.WHATSAPP_AI_API_KEY,
    model: values.WHATSAPP_AI_MODEL,
  };
}
