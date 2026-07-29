import "server-only";

import AfricasTalking from "africastalking";
import { logError, logInfo, logWarn } from "@/lib/logger";

type SmsRecipient = {
  status?: string;
  statusCode?: number;
};

type SmsResponse = {
  SMSMessageData?: {
    Recipients?: SmsRecipient[];
  };
};

function getSmsClient() {
  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;

  if (!username || !apiKey) return null;

  return AfricasTalking({ username, apiKey }).SMS;
}

export async function sendBookingConfirmationSms({
  bookingId,
  name,
  phone,
}: {
  bookingId: string;
  name: string;
  phone: string;
}): Promise<{ success: boolean }> {
  const sms = getSmsClient();

  if (!sms) {
    logWarn("Booking SMS skipped because Africa's Talking is not configured", { bookingId });
    return { success: false };
  }

  const firstName = name.split(/\s+/)[0] || "there";
  const message = `Hello ${firstName}, your Travel With Hawkins booking request has been received. We will contact you shortly.`;

  try {
    const response = (await sms.send({ to: [phone], message })) as SmsResponse;
    const recipient = response.SMSMessageData?.Recipients?.[0];
    const status = recipient?.status?.toLowerCase();
    const success = Boolean(recipient) && status !== "failed" && status !== "rejected";

    if (success) {
      logInfo("Booking SMS accepted by Africa's Talking", { bookingId, providerStatus: recipient?.status });
    } else {
      logWarn("Booking SMS was not accepted by Africa's Talking", {
        bookingId,
        providerStatus: recipient?.status || "unknown",
        providerStatusCode: recipient?.statusCode,
      });
    }

    return { success };
  } catch (error) {
    logError("Booking SMS delivery request failed", {
      bookingId,
      error: error instanceof Error ? error.message : "Unknown provider error",
    });
    return { success: false };
  }
}
