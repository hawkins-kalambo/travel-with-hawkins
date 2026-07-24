import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requireAdminUser, requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const full_name = typeof body.full_name === "string" ? body.full_name.trim() : undefined;
    const student_id = typeof body.student_id === "string" ? body.student_id.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
    const whatsapp_number = typeof body.whatsapp_number === "string" ? body.whatsapp_number.trim() : undefined;
    const university = typeof body.university === "string" ? body.university.trim() : "Mzuzu University";
    const faculty = typeof body.faculty === "string" ? body.faculty.trim() : undefined;
    const program = typeof body.program === "string" ? body.program.trim() : undefined;
    const year_of_study = body.year_of_study ? parseInt(String(body.year_of_study), 10) : null;
    const motivation = typeof body.motivation === "string" ? body.motivation.trim() : undefined;
    const leadership_experience = typeof body.leadership_experience === "string" ? body.leadership_experience.trim() : undefined;
    const marketing_experience = typeof body.marketing_experience === "string" ? body.marketing_experience.trim() : undefined;
    const social_media_influence = typeof body.social_media_influence === "string" ? body.social_media_influence.trim() : undefined;
    const communities = typeof body.communities === "string" ? body.communities.trim() : undefined;

    if (!full_name || !student_id || !email || !phone || !program || !motivation) {
      return jsonError("Missing required fields", 400);
    }

    // Prepare application ID for storage path
    const applicationId = randomUUID();
    let profileImageUrl: string | null = null;

    const profileImageBase64 = typeof body.profileImageBase64 === "string" ? body.profileImageBase64 : undefined;

    if (profileImageBase64) {
      // Expected format: data:<mime>;base64,<data>
      const matches = profileImageBase64.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
      if (!matches) {
        return jsonError("Invalid image data format", 400);
      }

      const mime = matches[1];
      const ext = matches[2] === "png" ? "png" : matches[2] === "webp" ? "webp" : "jpg";
      const data = matches[3];
      const buffer = Buffer.from(data, "base64");

      const bucket = "ambassador-profiles";
      const path = `applications/${applicationId}/profile.${ext}`;

      try {
        const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
          contentType: mime,
          upsert: false,
        });

        if (uploadError) {
          console.warn("Profile image upload skipped because storage is unavailable", uploadError.message);
        } else {
          // Get public URL (if bucket public) else create signed URL
          const urlRes = await supabaseAdmin.storage.from(bucket).getPublicUrl(path);
          const publicUrl = urlRes?.data?.publicUrl ?? null;

          if (!publicUrl) {
            // Attempt to create a signed URL (server-side)
            const { data: signed, error: signedErr } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
            if (signedErr) {
              console.warn("Failed to create signed url for profile image", signedErr.message);
            } else {
              const signedPayload = signed as { signedUrl?: string } | null;
              profileImageUrl = signedPayload?.signedUrl ?? null;
            }
          } else {
            profileImageUrl = publicUrl;
          }
        }
      } catch (storageError) {
        console.warn("Profile image upload skipped due to storage error", storageError instanceof Error ? storageError.message : String(storageError));
      }
    }

    const insertPayload: Record<string, unknown> = {
      id: applicationId,
      full_name,
      student_id,
      email,
      phone,
      whatsapp_number,
      university,
      faculty,
      program,
      year_of_study,
      profile_image_url: profileImageUrl,
      motivation,
      leadership_experience,
      marketing_experience,
      social_media_influence,
      communities,
      status: "pending",
    };

    const { data: inserted, error: insertError } = await supabaseAdmin.from("ambassador_applications").insert([insertPayload]).select().single();
    if (insertError) {
      console.error("Failed to insert application", insertError);
      return jsonError(insertError.message || "Failed to save application", 500);
    }

    return NextResponse.json({ success: true, application: inserted });
  } catch (err) {
    console.error("POST /api/applications error", err);
    return jsonError(err instanceof Error ? err.message : String(err));
  }
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  const { authorized } = await requireAdminUser(req, response);
  const query = supabaseAdmin
    .from("ambassador_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (!authorized) {
    const email = typeof authUser.user.email === "string" ? authUser.user.email.toLowerCase().trim() : "";
    if (!email) {
      return NextResponse.json({ success: true, applications: [] });
    }
    query.eq("email", email);
  }

  try {
    const { data, error: fetchError } = await query;

    if (fetchError) {
      console.error("GET /api/applications fetch error", fetchError);
      return NextResponse.json({ success: false, error: fetchError.message || "Unable to load applications" }, { status: 500 });
    }

    return NextResponse.json({ success: true, applications: data ?? [] });
  } catch (err) {
    console.error("GET /api/applications error", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
