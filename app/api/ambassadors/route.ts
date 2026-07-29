import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/resend";
import { buildAmbassadorWelcomeEmailHtml } from "@/lib/ambassadorEmail";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getErrorMessage(error: unknown, fallback = "Unable to create ambassador") {
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

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

async function findExistingAuthUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data: existingProfile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!profileErr && existingProfile?.id) {
    return existingProfile.id;
  }

  let page = 1;
  while (page > 0) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100, page });
    if (error) {
      console.warn("Failed to list auth users while looking for email", { error });
      break;
    }

    const users = Array.isArray((data as unknown as { users?: unknown[] } | null)?.users)
      ? ((data as unknown as { users?: unknown[] }).users ?? [])
      : [];
    const found = users.find((user) => typeof (user as { email?: unknown }).email === "string" && String((user as { email?: unknown }).email).trim().toLowerCase() === normalizedEmail);
    const foundId = typeof (found as { id?: unknown })?.id === "string" ? (found as { id?: string }).id : undefined;
    if (foundId) {
      return foundId;
    }

    page = Number((data as { nextPage?: number } | null)?.nextPage ?? 0);
    if (!page) break;
  }

  return null;
}

async function uploadProfileImage(base64: string) {
  const matches = base64.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
  if (!matches) return null;

  const mime = matches[1];
  const ext = matches[2] === "png" ? "png" : matches[2] === "webp" ? "webp" : "jpg";
  const path = `ambassadors/${randomUUID()}/profile.${ext}`;
  const buffer = Buffer.from(matches[3], "base64");

  try {
    const { error } = await supabaseAdmin.storage.from("ambassador-profiles").upload(path, buffer, { contentType: mime, upsert: false });
    if (error) {
      console.warn("Profile image upload skipped", error.message);
      return null;
    }

    const { data: urlData } = await supabaseAdmin.storage.from("ambassador-profiles").getPublicUrl(path);
    return urlData?.publicUrl ?? null;
  } catch (error) {
    console.warn("Profile image upload failed", error);
    return null;
  }
}

function slugify(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 16);
}

function generateTemporaryPassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  const random = randomBytes(12);
  const password = Array.from(random)
    .map((byte) => chars[byte % chars.length])
    .join("");
  return `TWHAmb@${password.slice(0, 8)}`;
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  const { data, error: fetchError } = await supabaseAdmin
    .from("ambassadors")
    .select("*")
    .order("created_at", { ascending: false });

  if (fetchError) return jsonError(fetchError.message || "Unable to load ambassadors", 500);
  return NextResponse.json({ success: true, ambassadors: data ?? [] });
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  let userId: string | undefined;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const fullName = getString(body.fullName ?? body.full_name);
    const phone = getString(body.phone);
    const email = getString(body.email)?.toLowerCase();
    const university = getString(body.university) ?? "Mzuzu University";
    const faculty = getString(body.faculty);
    const program = getString(body.program);
    const yearOfStudy = typeof body.yearOfStudy === "number" ? body.yearOfStudy : parseInt(String(body.yearOfStudy ?? ""), 10);
    const referralCode = getString(body.referralCode ?? body.referral_code);
    const profileImageBase64 = typeof body.profileImageBase64 === "string" ? body.profileImageBase64 : undefined;
    const requestedTemporaryPassword = getString(body.temporaryPassword);

    if (!fullName || !phone || !email) {
      return jsonError("fullName, phone, and email are required", 400);
    }

    const finalCode = (referralCode || slugify(fullName || "HAWKINS") + "01").trim().toUpperCase();

    const { data: existingCode, error: existingCodeError } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .eq("referral_code", finalCode)
      .maybeSingle();

    if (existingCodeError) throw existingCodeError;
    if (existingCode) return jsonError("Referral code already exists", 409);

    const existingAuthUserId = await findExistingAuthUserIdByEmail(email);
    if (existingAuthUserId) {
      userId = existingAuthUserId;
      console.debug("/api/ambassadors: found existing auth user by email", { userId, email });
    }

    let temporaryPassword: string | undefined = requestedTemporaryPassword;
    if (!userId) {
      temporaryPassword = temporaryPassword || generateTemporaryPassword();

      const { data: createUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          role: "ambassador",
        },
      });

      if (createUserError || !createUserData?.user?.id) {
        throw createUserError || new Error("Unable to create ambassador user");
      }

      userId = createUserData.user.id;
      console.debug("/api/ambassadors: created auth user", { userId, email });
    }

    const profilePayload: Record<string, unknown> = {
      id: userId,
      full_name: fullName,
      email,
      phone,
      role: "ambassador",
    };

    if (profileImageBase64) {
      const profileImageUrl = await uploadProfileImage(profileImageBase64);
      if (profileImageUrl) {
        profilePayload.profile_image_url = profileImageUrl;
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert([profilePayload], { onConflict: "id" })
      .select()
      .single();

    if (profileError) {
      const isMissingProfilesTable =
        typeof profileError.message === "string" &&
        profileError.message.includes("Could not find the table 'public.profiles' in the schema cache");

      if (!isMissingProfilesTable) {
        throw profileError;
      }

      console.warn("Skipping profile insert because public.profiles is not available", profileError);
    }

    const ambassadorInsertPayload: Record<string, unknown> = {
      user_id: userId,
      full_name: fullName,
      phone,
      email,
      university,
      faculty,
      program,
      year_of_study: Number.isFinite(yearOfStudy) ? yearOfStudy : null,
      referral_code: finalCode,
      status: "active",
      created_by_admin: true,
    };

    if (profileImageBase64) {
      const profileImageUrl = await uploadProfileImage(profileImageBase64);
      if (profileImageUrl) {
        ambassadorInsertPayload.profile_image_url = profileImageUrl;
      }
    }

    const { data: existingAmbassadorByEmail, error: existingAmbassadorByEmailError } = await supabaseAdmin
      .from("ambassadors")
      .select("id, user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingAmbassadorByEmailError) throw existingAmbassadorByEmailError;

    let ambassadorData: Record<string, unknown> | null = null;
    let ambassadorError: unknown = null;

    if (existingAmbassadorByEmail) {
      if (existingAmbassadorByEmail.user_id && existingAmbassadorByEmail.user_id !== userId) {
        return jsonError("Ambassador with this email already exists", 409);
      }

      const { data: updatedAmbassador, error: updateError } = await supabaseAdmin
        .from("ambassadors")
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", existingAmbassadorByEmail.id)
        .select()
        .single();

      if (updateError) throw updateError;
      ambassadorData = updatedAmbassador;
    } else {
      const insertResponse = await supabaseAdmin.from("ambassadors").insert([ambassadorInsertPayload]).select().single();
      ambassadorData = insertResponse.data as Record<string, unknown> | null;
      ambassadorError = insertResponse.error;

      if (ambassadorError && isMissingAmbassadorProfileIdColumn(ambassadorError)) {
        console.warn("Ambassadors table does not include profile_id; retrying insert without it.", ambassadorError);
        const fallbackInsert = await supabaseAdmin
          .from("ambassadors")
          .insert([
            {
              full_name: fullName,
              phone,
              email,
              university,
              faculty,
              program,
              year_of_study: Number.isFinite(yearOfStudy) ? yearOfStudy : null,
              referral_code: finalCode,
              status: "active",
            },
          ])
          .select()
          .single();
        ambassadorData = fallbackInsert.data as Record<string, unknown> | null;
        ambassadorError = fallbackInsert.error;
      }

      if (ambassadorError) {
        throw ambassadorError;
      }
    }

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://travel-with-hawkins.vercel.app";
      const html = buildAmbassadorWelcomeEmailHtml({
        ambassadorName: fullName,
        email,
        loginUrl: appUrl,
        referralCode: finalCode,
        referralLink: `${appUrl.replace(/\/$/, "")}/book?ref=${encodeURIComponent(finalCode)}`,
        temporaryPassword,
      });

      await sendEmail({
        to: email,
        subject: "Welcome to Travel with Hawkins",
        html,
      });
    } catch (emailError) {
      console.warn("Welcome email failed", { error: emailError });
    }

    return NextResponse.json({
      success: true,
      ambassador: ambassadorData,
      credentials: {
        fullName,
        email,
        referralCode: finalCode,
        temporaryPassword,
      },
    });
  } catch (error) {
    if (userId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (deleteError) {
        console.error("Failed to roll back ambassador user", deleteError);
      }
    }

    return jsonError(getErrorMessage(error, "Unable to create ambassador"), 500);
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const ambassadorId = getString(body.ambassadorId ?? body.id);
    const status = getString(body.status);

    if (!ambassadorId || !status) {
      return jsonError("ambassadorId and status are required", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("ambassadors")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", ambassadorId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, ambassador: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update ambassador", 500);
  }
}
