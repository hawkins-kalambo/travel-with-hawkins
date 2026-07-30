import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/resend";
import { logAmbassadorActivity } from "@/lib/ambassadorActivity";
import { publishCommunicationEvent } from "@/lib/communicationEngine";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function getErrorMessage(error: unknown, fallback = "Unable to process application") {
  if (!error) return fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
}

function isMissingAmbassadorProfileIdColumn(error: unknown): boolean {
  if (!error) return false;
  const message = getErrorMessage(error, "");
  return (message.includes("profile_id") || message.includes("user_id")) && message.includes("schema cache");
}

type SupabaseUserRecord = {
  id?: string;
  email?: string;
  user_metadata?: {
    username?: string;
  };
};

type SupabaseListUsersData = {
  users?: SupabaseUserRecord[];
  nextPage?: number;
};

type AmbassadorRecord = {
  id?: string;
  status?: string;
  referral_code?: string;
  profile_id?: string;
  full_name?: string;
  phone?: string;
  email?: string;
};

async function findExistingAuthUserIdByEmail(email: string): Promise<string | null> {
  const { data: existingProfile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileErr) {
    console.warn("Failed to query existing profile by email", profileErr);
  }

  if (existingProfile?.id) {
    return existingProfile.id;
  }

  let page = 1;
  while (page > 0) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100, page });
    if (error) {
      console.warn("Failed to list auth users while looking for email", { error });
      break;
    }

    const users = Array.isArray((data as SupabaseListUsersData | null)?.users) ? (data as SupabaseListUsersData).users ?? [] : [];
    const found = users.find((user) => normalizeEmail(user.email) === email);
    if (found?.id) {
      return found.id;
    }

    page = Number((data as SupabaseListUsersData | null)?.nextPage ?? 0);
    if (!page) break;
  }

  return null;
}

function generateTemporaryPassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  const random = randomBytes(12);
  const password = Array.from(random).map((byte) => chars[byte % chars.length]).join("");
  return `TWHAmb@${password.slice(0, 8)}`;
}

function buildAmbassadorUsername(fullName: string, fallbackEmail: string) {
  const base = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");

  if (!base) {
    return fallbackEmail.split("@")[0]?.replace(/[^a-z0-9._-]/gi, "") || "ambassador";
  }

  return base;
}

async function ensureUniqueUsername(baseUsername: string) {
  let username = baseUsername;
  let suffix = 1;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100, page });
    if (error) break;

    const users = Array.isArray((data as SupabaseListUsersData | null)?.users)
      ? ((data as SupabaseListUsersData).users ?? [])
      : [];
    const taken = users.some((user) => String(user.user_metadata?.username || "").toLowerCase() === username.toLowerCase());
    if (!taken) return username;

    username = `${baseUsername}${suffix}`;
    suffix += 1;

    const nextPage = Number((data as SupabaseListUsersData | null)?.nextPage ?? 0);
    if (!nextPage) {
      break;
    }
    page = nextPage;
  }

  return username;
}

function getReferralLink(code: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://travelwithhawkins.com";
  return `${appUrl.replace(/\/$/, "")}/book?ref=${encodeURIComponent(code)}`;
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user: adminUser, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as { applicationId?: string; action?: "approve" | "reject"; rejectionReason?: string };
    const { applicationId, action, rejectionReason } = body;
    if (!applicationId || !action) return jsonError("applicationId and action are required", 400);

    const { data: application, error: appErr } = await supabaseAdmin
      .from("ambassador_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr) return jsonError(appErr.message || "Unable to load application", 500);
    if (!application) return jsonError("Application not found", 404);

    if (action === "reject") {
      const { error: updateErr } = await supabaseAdmin
        .from("ambassador_applications")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by_id: adminUser?.id, rejection_reason: rejectionReason ?? null })
        .eq("id", applicationId);

      if (updateErr) return jsonError(updateErr.message || "Failed to reject application", 500);

      // optional: send rejection email
      if (application.email) {
        try {
          await sendEmail({
            to: application.email,
            subject: "Your Travel with Hawkins Ambassador Application",
            html: `<p>Hi ${application.full_name},</p><p>Thank you for your application. After review, we are unable to move forward with your application at this time.</p><p>Reason: ${rejectionReason ?? "Not specified"}</p>`,
          });
        } catch (e) {
          console.warn("Failed to send rejection email", e);
        }
      }

      return NextResponse.json({ success: true });
    }

    // APPROVE flow
    // 1. Create auth user
    const email = normalizeEmail(application.email);
    const fullName = String(application.full_name);
    const phone = String(application.phone || "");
    const university = String(application.university || "Mzuzu University");

    const existingUserId = await findExistingAuthUserIdByEmail(email);
    let userId: string | null = existingUserId;
    let passwordToSend: string | null = null;
    const accountAlreadyExists = Boolean(userId);

    // generate referral code in TH-<UNI>-00001 format
    const uniCodeRaw = (university || "MZU").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    const uniCode = (uniCodeRaw + "XXX").slice(0, 3);

    // determine numeric suffix
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("ambassadors")
      .select("referral_code")
      .like("referral_code", `TH-${uniCode}-%`);

    if (existingErr) {
      console.warn("Failed to fetch existing ambassadors for code generation", existingErr);
    }

    const nextNumber = (Array.isArray(existing) ? existing.length : 0) + 1;
    const suffix = String(nextNumber).padStart(5, "0");
    let finalReferralCode = `TH-${uniCode}-${suffix}`;

    // ensure unique
    let tries = 0;
    while (tries < 5) {
      const { data: check, error: checkErr } = await supabaseAdmin.from("ambassadors").select("id").eq("referral_code", finalReferralCode).maybeSingle();
      if (checkErr) break;
      if (!check) break;
      // collision, increment
      const num = parseInt(suffix, 10) + tries + 1;
      finalReferralCode = `TH-${uniCode}-${String(num).padStart(5, "0")}`;
      tries++;
    }

    const usernameBase = buildAmbassadorUsername(fullName, email);
    const username = await ensureUniqueUsername(usernameBase);

    if (!userId) {
      const tempPassword = generateTemporaryPassword();
      passwordToSend = tempPassword;

      const { data: createUserData, error: createUserErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone, role: "ambassador", username },
      });

      if (createUserErr || !createUserData?.user?.id) {
        const duplicateEmail = createUserErr?.message?.includes("already been registered") || createUserErr?.message?.toLowerCase().includes("duplicate");
        if (duplicateEmail) {
          userId = await findExistingAuthUserIdByEmail(email);
          console.debug("/api/applications/review: resolved existing auth user", { userId, email });
        }
        if (!userId) {
          console.error("Failed to create auth user", createUserErr);
          return jsonError(createUserErr?.message || "Failed to create ambassador user", 500);
        }
      } else {
        userId = createUserData.user.id;
        console.debug("/api/applications/review: created auth user", { userId, email });
      }

      if (!existingUserId && userId) {
        const { error: profileErr } = await supabaseAdmin.from("profiles").insert([
          { id: userId, full_name: fullName, email, phone, role: "ambassador" },
        ]).select().single();

        if (profileErr) {
          console.warn("profiles insert warning", profileErr);
        }
      }
    }

    if (!userId) {
      return jsonError("Unable to determine user account for this email", 500);
    }

    // insert ambassador record
    const ambassadorPayload: Record<string, unknown> = {
      user_id: userId,
      full_name: fullName,
      phone,
      email,
      university,
      faculty: application.faculty || null,
      program: application.program || null,
      year_of_study: application.year_of_study || null,
      referral_code: finalReferralCode,
      status: "active",
    };

    const { data: existingAmbassador, error: existingAmbassadorErr } = await supabaseAdmin
      .from("ambassadors")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (existingAmbassadorErr) {
      console.warn("Failed to query existing ambassador record", existingAmbassadorErr);
    }

    let ambassadorData: AmbassadorRecord | null = null;

    if (existingAmbassador) {
      ambassadorData = existingAmbassador as AmbassadorRecord;

      if (!existingAmbassador.user_id && userId) {
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from("ambassadors")
          .update({ user_id: userId, updated_at: new Date().toISOString() })
          .eq("id", existingAmbassador.id)
          .select()
          .single();

        if (!updateErr && updated) {
          ambassadorData = updated as AmbassadorRecord;
        }
      }

      if (existingAmbassador.status !== "active") {
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from("ambassadors")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("id", existingAmbassador.id)
          .select()
          .single();
        if (!updateErr && updated) {
          ambassadorData = updated as AmbassadorRecord;
        }
      }
    } else {
      let ambassadorInsertResponse = await supabaseAdmin.from("ambassadors").insert([ambassadorPayload]).select().single();

      if (ambassadorInsertResponse.error && isMissingAmbassadorProfileIdColumn(ambassadorInsertResponse.error)) {
        console.warn("Ambassadors table does not include profile_id; retrying insert without it.", ambassadorInsertResponse.error);
        ambassadorInsertResponse = await supabaseAdmin.from("ambassadors").insert([
          {
            full_name: fullName,
            phone,
            email,
            university,
            faculty: application.faculty || null,
            program: application.program || null,
            year_of_study: application.year_of_study || null,
            referral_code: finalReferralCode,
            status: "active",
          },
        ]).select().single();
      }

      if (ambassadorInsertResponse.error) {
        console.error("Failed to insert ambassador", ambassadorInsertResponse.error);
        return jsonError(ambassadorInsertResponse.error.message || "Failed to create ambassador record", 500);
      }

      ambassadorData = ambassadorInsertResponse.data as AmbassadorRecord;
    }

    // update application status
    const { error: updateAppErr } = await supabaseAdmin.from("ambassador_applications").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by_id: adminUser?.id }).eq("id", applicationId);
    if (updateAppErr) {
      console.warn("Failed to update application status", updateAppErr);
    }

    await logAmbassadorActivity({
      ambassadorId: ambassadorData?.id ?? null,
      profileId: userId ?? null,
      activityType: "account_created",
      description: `Ambassador account created from application approval for ${fullName}`,
    });

    await publishCommunicationEvent({
      type: "application_approved",
      actor_id: adminUser?.id ?? undefined,
      payload: {
        profile_id: userId,
        application_id: applicationId,
        referral_code: finalReferralCode,
      },
    });

    // send welcome email with credentials or update notice for existing users
    try {
      const emailHtml = accountAlreadyExists
        ? `
          <div style="font-family:Arial,sans-serif;padding:18px;">
            <h2 style="color:#0A4D8C;">Your ambassador application has been approved</h2>
            <p>Hi <strong>${fullName}</strong>,</p>
            <p>Your ambassador account has been approved and your referral code is now active.</p>
            <ul>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Referral code:</strong> ${finalReferralCode}</li>
            </ul>
            <p>If you do not remember your password, please use the password reset flow on the login page.</p>
          </div>
        `
        : `
          <div style="font-family:Arial,sans-serif;padding:18px;">
            <h2 style="color:#0A4D8C;">Welcome to Travel with Hawkins</h2>
            <p>Hi <strong>${fullName}</strong>,</p>
            <p>Your ambassador account is ready. Use the credentials below to log in and start sharing your referral code.</p>
            <ul>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Temporary password:</strong> ${passwordToSend}</li>
              <li><strong>Referral code:</strong> ${finalReferralCode}</li>
            </ul>
            <p>Please change your password after first login.</p>
          </div>
        `;

      await sendEmail({
        to: email,
        subject: accountAlreadyExists ? "Your Travel with Hawkins Ambassador Application Approved" : "Welcome to Travel with Hawkins - Ambassador",
        html: emailHtml,
      });
    } catch (e) {
      console.warn("Failed to send welcome email", e);
    }

    const referralLink = getReferralLink(finalReferralCode);
    return NextResponse.json({
      success: true,
      ambassador: ambassadorData,
      result: {
        ambassadorId: ambassadorData?.id ?? finalReferralCode,
        referralCode: finalReferralCode,
        referralLink,
        username,
        temporaryPassword: passwordToSend,
        email,
        fullName,
      },
    });
  } catch (err) {
    console.error("POST /api/applications/review error", err);
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}
