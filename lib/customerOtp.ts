import { randomInt, createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/resend";
import { buildOtpEmailHtml } from "@/lib/customerEmail";
import { sendOtpSms } from "@/lib/africasTalking";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { isRateLimited } from "@/lib/rateLimit";

export type OtpChannel = "email" | "sms";

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function generateSixDigitCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function generateAndSendOtp(
  customerId: string,
  email: string,
  fullName: string,
  channel: OtpChannel = "email",
  phone?: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  let normalizedPhone: string | undefined;
  if (channel === "sms") {
    normalizedPhone = normalizeMalawiPhone(phone);
    if (!normalizedPhone) {
      return { success: false, error: "A valid phone number is required to send an SMS code" };
    }
  }

  const limited = await isRateLimited(`otp:${normalizedEmail}`, 600, 3);
  if (limited) {
    return { success: false, error: "Too many verification codes requested. Please wait a few minutes and try again." };
  }

  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabaseAdmin.from("customer_email_otps").insert([
    {
      customer_id: customerId,
      email: normalizedEmail,
      phone: normalizedPhone ?? null,
      channel,
      otp_hash: hashOtp(code),
      expires_at: expiresAt,
    },
  ]);

  if (insertError) {
    console.error("Failed to store OTP", insertError);
    return { success: false, error: "Failed to generate verification code" };
  }

  if (channel === "sms" && normalizedPhone) {
    const smsResult = await sendOtpSms({ phone: normalizedPhone, otp: code });
    if (!smsResult.success) {
      return { success: false, error: "Failed to send verification SMS" };
    }
    return { success: true };
  }

  const emailResult = await sendEmail({
    to: normalizedEmail,
    subject: "Your Travel with Hawkins verification code",
    html: buildOtpEmailHtml({ fullName, otp: code }),
  });

  if (!emailResult.success) {
    return { success: false, error: "Failed to send verification email" };
  }

  return { success: true };
}

export async function verifyOtp(
  email: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customer_profiles")
    .select("id, email_verified")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (customerError || !customer) {
    return { success: false, error: "Account not found" };
  }

  if (customer.email_verified) {
    return { success: true };
  }

  const { data: otpRow, error: otpError } = await supabaseAdmin
    .from("customer_email_otps")
    .select("id, otp_hash, expires_at, attempts, consumed_at")
    .eq("customer_id", customer.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpError || !otpRow) {
    return { success: false, error: "No verification code found. Please request a new one." };
  }

  if (otpRow.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return { success: false, error: "This code has expired. Please request a new one." };
  }

  if (hashOtp(code.trim()) !== otpRow.otp_hash) {
    await supabaseAdmin
      .from("customer_email_otps")
      .update({ attempts: otpRow.attempts + 1 })
      .eq("id", otpRow.id);
    return { success: false, error: "Incorrect code. Please try again." };
  }

  await supabaseAdmin
    .from("customer_email_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otpRow.id);

  await supabaseAdmin
    .from("customer_profiles")
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq("id", customer.id);

  await supabaseAdmin.auth.admin.updateUserById(customer.id, { email_confirm: true });

  return { success: true };
}

export async function getCustomerContactByEmail(
  email: string
): Promise<{ id: string; fullName: string; phone: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("customer_profiles")
    .select("id, full_name, phone")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, fullName: data.full_name || "there", phone: data.phone };
}
