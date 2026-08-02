import "server-only";

import AfricasTalking from "africastalking";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { maskPhoneNumber } from "@/lib/phoneNumbers";

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
  const message = `Hello ${firstName}, your Travel With Hawkins booking request has been received. We will contact you shortly.`;

  return deliverSms({
    phone,
    message,
    logLabel: "Booking SMS",
    logContext: { bookingId },
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
