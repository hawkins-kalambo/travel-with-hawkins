import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/resend";

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
  return message.includes("profile_id") && message.includes("schema cache");
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
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

    const temporaryPassword = generateTemporaryPassword();

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

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert([
        {
          id: userId,
          full_name: fullName,
          email,
          phone,
          role: "ambassador",
        },
      ])
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

    const ambassadorInsertPayload = {
      profile_id: userId,
      full_name: fullName,
      phone,
      email,
      university,
      faculty,
      program,
      year_of_study: Number.isFinite(yearOfStudy) ? yearOfStudy : null,
      referral_code: finalCode,
      status: "active",
    };

    let ambassadorData;
    let ambassadorError;

    ({ data: ambassadorData, error: ambassadorError } = await supabaseAdmin
      .from("ambassadors")
      .insert([ambassadorInsertPayload])
      .select()
      .single());

    if (ambassadorError && isMissingAmbassadorProfileIdColumn(ambassadorError)) {
      console.warn("Ambassadors table does not include profile_id; retrying insert without it.", ambassadorError);
      ({ data: ambassadorData, error: ambassadorError } = await supabaseAdmin
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
        .single());
    }

    if (ambassadorError) {
      throw ambassadorError;
    }

    try {
      await sendEmail({
        to: email,
        subject: "Welcome to Travel with Hawkins",
        html: `
          <div style="font-family:Arial,sans-serif;padding:20px;">
            <h2 style="color:#0f3f78;">Welcome to Travel with Hawkins</h2>
            <p>Hello <strong>${fullName}</strong>,</p>
            <p>Your ambassador account has been created. Use the details below to log in and start sharing your referral code.</p>
            <ul>
              <li><strong>Login URL:</strong> <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://travel-with-hawkins.vercel.app"}">Login to Travel with Hawkins</a></li>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Temporary Password:</strong> ${temporaryPassword}</li>
              <li><strong>Referral Code:</strong> ${finalCode}</li>
            </ul>
            <p>Please change your password after logging in.</p>
          </div>
        `,
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
