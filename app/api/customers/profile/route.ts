import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { getCustomerProfile, updateCustomerProfile, ensureCustomerProfileExists } from "@/lib/customerAuthAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function uploadCustomerProfileImage(base64: string, customerId: string) {
  const matches = base64.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
  if (!matches) return null;

  const mime = matches[1];
  const ext = matches[2] === "png" ? "png" : matches[2] === "webp" ? "webp" : "jpg";
  const path = `customers/${customerId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(matches[3], "base64");

  try {
    const { error } = await supabaseAdmin.storage.from("customer-profiles").upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });

    if (error) {
      console.warn("Customer profile image upload skipped", error.message);
      return null;
    }

    const { data: urlData } = await supabaseAdmin.storage.from("customer-profiles").getPublicUrl(path);
    return urlData?.publicUrl ?? null;
  } catch (error) {
    console.warn("Customer profile image upload failed", error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const response = NextResponse.next();
    const authResult = await requireAuthenticatedUser(req, response);

    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Backfills customer_profiles (+ preferences/settings) for a session
    // that reached this route with none — the only way that happens today
    // is a Google sign-in, since the client-side insert the OAuth callback
    // used to attempt is blocked by RLS. No-ops instantly if the row
    // already exists.
    await ensureCustomerProfileExists(authResult.user.id);

    const profile = await getCustomerProfile(authResult.user.id);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("GET /api/customers/profile error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get profile" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const response = NextResponse.next();
    const authResult = await requireAuthenticatedUser(req, response);

    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Same self-heal as GET — a customer editing their profile or uploading
    // a photo before ever loading GET /api/customers/profile (unlikely in
    // this app's flow, but cheap insurance) would otherwise hit the same
    // "row doesn't exist" failure this whole fix addresses.
    await ensureCustomerProfileExists(authResult.user.id);

    const body = await req.json();

    if (typeof body.profilePictureBase64 === "string" && body.profilePictureBase64) {
      const uploadedUrl = await uploadCustomerProfileImage(body.profilePictureBase64, authResult.user.id);
      if (!uploadedUrl) {
        return NextResponse.json(
          { success: false, error: "Failed to upload profile picture" },
          { status: 400 }
        );
      }
      body.profilePictureUrl = uploadedUrl;
      delete body.profilePictureBase64;
    }

    const result = await updateCustomerProfile(authResult.user.id, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to update profile" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: result.profile,
    });
  } catch (error) {
    console.error("PUT /api/customers/profile error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
