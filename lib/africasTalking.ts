import "server-only";

import AfricasTalking from "africastalking";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { maskPhoneNumber, normalizeMalawiPhone } from "@/lib/phoneNumbers";

type SmsRecipient = {
  messageId?: string;
  number?: string;
  status?: string;
  statusCode?: number;
};

type SmsResponse = {
  SMSMessageData?: {
    Message?: string;
    Recipients?: SmsRecipient[];
  };
};

export type SmsNotificationResult = {
  attempted: boolean;
  success: boolean;
  outcome: "sent" | "failed" | "rejected" | "other" | "skipped";
  status: string;
  statusCode?: number;
  messageId?: string;
};

function sanitizeCustomerName(name: string): string {
  const asciiName = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return asciiName.split(" ")[0]?.slice(0, 30) || "there";
}

function safeError(error: unknown): { errorName: string; errorMessage: string } {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownError", errorMessage: "Unknown provider error" };
  }

  return {
    errorName: error.name || "Error",
    errorMessage: error.message.replace(/\s+/g, " ").slice(0, 300),
  };
}

async function deliverSms({
  phone,
  message,
  logLabel,
  logContext,
}: {
  phone: string;
  message: string;
  logLabel: string;
  logContext: Record<string, unknown>;
}): Promise<SmsNotificationResult> {
  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const maskedDestination = maskPhoneNumber(phone);
  const environment = username?.toLowerCase() === "sandbox" ? "sandbox" : "production";

  logInfo(`${logLabel} configuration checked`, {
    ...logContext,
    usernamePresent: Boolean(username),
    apiKeyPresent: Boolean(apiKey),
    sandboxMode: environment === "sandbox",
  });

  if (!username || !apiKey) {
    logWarn(`${logLabel} skipped because Africa's Talking is not configured`, {
      ...logContext,
      destination: maskedDestination,
    });
    return {
      attempted: false,
      success: false,
      outcome: "skipped",
      status: "not_configured",
    };
  }

  logInfo(`${logLabel} send attempted`, {
    ...logContext,
    destination: maskedDestination,
    environment,
  });

  try {
    const sms = AfricasTalking({ username, apiKey }).SMS;
    const response = (await sms.send({ to: [phone], message })) as SmsResponse;
    const recipients = response.SMSMessageData?.Recipients;
    const recipient =
      recipients?.find((item) => !item.number || item.number === phone) ?? recipients?.[0];
    const providerStatus = recipient?.status?.trim() || "unknown";
    const normalizedStatus = providerStatus.toLowerCase();
    const success = normalizedStatus === "success";
    const outcome =
      success
        ? "sent"
        : normalizedStatus === "failed"
          ? "failed"
          : normalizedStatus === "rejected"
            ? "rejected"
            : "other";
    const diagnostic = {
      ...logContext,
      destination: maskedDestination,
      providerStatus,
      providerStatusCode: recipient?.statusCode,
      messageId: recipient?.messageId,
    };

    if (success) {
      logInfo(`${logLabel} accepted by Africa's Talking`, diagnostic);
    } else {
      logWarn(`${logLabel} was not accepted by Africa's Talking`, diagnostic);
    }

    return {
      attempted: true,
      success,
      outcome,
      status: providerStatus,
      statusCode: recipient?.statusCode,
      messageId: recipient?.messageId,
    };
  } catch (error) {
    logError(`${logLabel} delivery request failed`, {
      ...logContext,
      destination: maskedDestination,
      ...safeError(error),
    });
    return {
      attempted: true,
      success: false,
      outcome: "failed",
      status: "request_failed",
    };
  }
}

export async function sendBookingConfirmationSms({
  bookingId,
  name,
  phone,
}: {
  bookingId: string;
  name: string;
  phone: string;
}): Promise<SmsNotificationResult> {
  const firstName = sanitizeCustomerName(name);
  const message = `Hello ${firstName}, your Travel With Hawkins booking request has been received (Booking ID: ${bookingId}). We will contact you shortly.`;

  return deliverSms({
    phone,
    message,
    logLabel: "Booking SMS",
    logContext: { bookingId },
  });
}

export async function sendBookingJourneyUpdateSms({
  bookingId,
  phone,
  change,
  travelDate,
  cancellationReason,
}: {
  bookingId: string;
  phone: string;
  change: "cancelled" | "rescheduled";
  travelDate?: string;
  cancellationReason?: string;
}): Promise<SmsNotificationResult> {
  const reason = cancellationReason?.replace(/\s+/g, " ").trim().slice(0, 80);
  const message = change === "cancelled"
    ? `Travel With Hawkins booking ${bookingId} was cancelled.${reason ? ` Reason: ${reason}` : ""} Contact support for help.`
    : `Travel With Hawkins booking ${bookingId} was rescheduled to ${travelDate || "a new date"}. Contact support if you need help.`;

  return deliverSms({
    phone,
    message,
    logLabel: "Booking journey update SMS",
    logContext: { bookingId, change },
  });
}

// Fires once per live-chat handoff (see lib/websiteChat/adminAlerts.ts) --
// reads the destination from ADMIN_NOTIFICATION_PHONE rather than taking a
// phone param, since there's exactly one fixed recipient for this alert.
export async function sendAdminHandoffAlertSms({
  customerName,
  conversationUrl,
}: {
  customerName: string;
  conversationUrl: string;
}): Promise<SmsNotificationResult> {
  const adminPhone = process.env.ADMIN_NOTIFICATION_PHONE;
  if (!adminPhone) {
    logWarn("Admin handoff alert SMS skipped because ADMIN_NOTIFICATION_PHONE is not configured", {});
    return { attempted: false, success: false, outcome: "skipped", status: "not_configured" };
  }

  const normalized = normalizeMalawiPhone(adminPhone);
  if (!normalized) {
    logWarn("Admin handoff alert SMS skipped because ADMIN_NOTIFICATION_PHONE is not a valid Malawi number", {
      destination: maskPhoneNumber(adminPhone),
    });
    return { attempted: false, success: false, outcome: "skipped", status: "invalid_number" };
  }

  const firstName = sanitizeCustomerName(customerName);
  const message = `Travel with Hawkins: ${firstName} needs a human agent on live chat. ${conversationUrl}`;

  return deliverSms({
    phone: normalized,
    message,
    logLabel: "Admin handoff alert SMS",
    logContext: {},
  });
}

export async function sendOtpSms({
  phone,
  otp,
}: {
  phone: string;
  otp: string;
}): Promise<SmsNotificationResult> {
  const message = `Your Travel with Hawkins verification code is ${otp}. It expires in 10 minutes.`;

  return deliverSms({
    phone,
    message,
    logLabel: "OTP SMS",
    logContext: {},
  });
}
