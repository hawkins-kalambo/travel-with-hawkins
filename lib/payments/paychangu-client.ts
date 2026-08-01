import "server-only";

import { logError, logWarn } from "@/lib/logger";
import { getPayChanguEnv } from "./env";
import type { PayChanguInitializeRequest, PayChanguInitializeResponse, PayChanguVerifyResponse } from "./paychangu-types";

const REQUEST_TIMEOUT_MS = 15_000;

// Safe to show to a customer or return from an API route — never includes
// provider response bodies, headers, or secrets.
export class PayChanguClientError extends Error {
  readonly code: string;
  readonly httpStatus?: number;

  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = "PayChanguClientError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function payChanguRequest(path: string, init: RequestInit): Promise<unknown> {
  const env = getPayChanguEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
        // Never spread caller-provided headers after this line — Authorization
        // must always be the value we set, never overridable by a caller.
        Authorization: `Bearer ${env.secretKey}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    logError("PayChangu request failed", { path, reason: isAbort ? "timeout" : "network_error" });
    throw new PayChanguClientError(isAbort ? "timeout" : "network_error", "Unable to reach the payment provider. Please try again.");
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await response.text();
  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    logError("PayChangu returned a non-JSON response", { path, httpStatus: response.status });
    throw new PayChanguClientError("malformed_response", "The payment provider returned an unexpected response.", response.status);
  }

  if (!response.ok) {
    // Provider error messages can be shown server-side (for diagnostics)
    // but are never propagated verbatim to the caller of this client —
    // they may contain internal details we don't want surfaced to a browser.
    const providerMessage = isRecord(body) && typeof body.message === "string" ? body.message : undefined;
    logWarn("PayChangu returned a non-2xx response", { path, httpStatus: response.status, providerMessage });
    throw new PayChanguClientError("provider_error", "The payment provider rejected the request.", response.status);
  }

  return body;
}

// POST https://api.paychangu.com/payment — Standard Checkout initialization.
export async function initializePayChanguPayment(request: PayChanguInitializeRequest): Promise<PayChanguInitializeResponse> {
  const body = await payChanguRequest("/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!isRecord(body)) {
    throw new PayChanguClientError("malformed_response", "The payment provider returned an unexpected response.");
  }

  // Every field on PayChanguInitializeResponse is optional, so this cast
  // widens rather than fabricates data — callers must still check each
  // field's presence before use, same as with the verify response.
  return body as PayChanguInitializeResponse;
}

// GET https://api.paychangu.com/verify-payment/{tx_ref} — server-side
// re-verification. This is the only source of truth for payment status;
// callers must not treat a callback or webhook payload as sufficient on
// its own (see lib/payments/verification-validator.ts).
export async function verifyPayChanguTransaction(txRef: string): Promise<PayChanguVerifyResponse> {
  if (!txRef || !txRef.trim()) {
    throw new PayChanguClientError("invalid_tx_ref", "A transaction reference is required to verify a payment.");
  }

  const body = await payChanguRequest(`/verify-payment/${encodeURIComponent(txRef.trim())}`, {
    method: "GET",
  });

  if (!isRecord(body)) {
    throw new PayChanguClientError("malformed_response", "The payment provider returned an unexpected response.");
  }

  return body as PayChanguVerifyResponse;
}
