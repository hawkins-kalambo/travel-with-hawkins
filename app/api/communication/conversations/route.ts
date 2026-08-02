import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminLikeRole, normalizeAppRole } from "@/lib/permissions";
import { getErrorMessage } from "@/lib/communicationServer";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("communication_conversation_participants")
      .select("conversation_id, starred, archived, last_read_at, communication_conversations(id, title, conversation_type, updated_at)")
      .eq("profile_id", authUser.user.id)
      .eq("deleted", false)
      .order("communication_conversations.updated_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, conversations: data ?? [] });
  } catch (err) {
    console.error("GET /api/communication/conversations error", err);
    return jsonError(getErrorMessage(err, "Unable to load conversations"), 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  const senderId = authUser.user.id;
  const senderMetadataRole = authUser.user.user_metadata?.role;

  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";
    const recipientId = typeof body.recipientId === "string" ? body.recipientId.trim() : "";

    if (!title || !messageBody) {
      return jsonError("Title and message are required", 400);
    }

    const { data: senderProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", senderId)
      .maybeSingle();

    const senderRole = normalizeAppRole(senderProfile?.role || senderMetadataRole);
    const senderIsAdmin = isAdminLikeRole(senderRole);

    // Admins may direct-message a specific customer; customers may only start
    // conversations that reach the support team (recipientId is ignored for them).
    if (recipientId && !senderIsAdmin) {
      return jsonError("Only admins can message a specific recipient", 403);
    }

    if (!senderProfile) {
      // communication_conversations.created_by and communication_messages.sender_id
      // are both foreign keys to profiles.id. Customers who signed up via Google
      // OAuth never get a profiles row (app/auth/callback only writes
      // customer_profiles) — without this, every insert below fails with an FK
      // violation that the catch block below can't even surface properly.
      const { data: customerProfile } = await supabaseAdmin
        .from("customer_profiles")
        .select("full_name, email")
        .eq("id", senderId)
        .maybeSingle();

      const { error: backfillSenderError } = await supabaseAdmin.from("profiles").insert({
        id: senderId,
        full_name: customerProfile?.full_name || "Customer",
        email: customerProfile?.email || authUser.user.email,
        role: "customer",
      });

      if (backfillSenderError && !backfillSenderError.message.includes("duplicate")) {
        console.warn("Failed to backfill profiles row for sender", backfillSenderError.message);
      }
    }

    const { data: conversationData, error: conversationError } = await supabaseAdmin
      .from("communication_conversations")
      .insert({
        title,
        conversation_type: recipientId ? "direct" : "support",
        created_by: senderId,
      })
      .select()
      .single();

    if (conversationError) throw conversationError;

    const participantIds = new Set<string>([senderId]);

    if (senderIsAdmin && recipientId) {
      participantIds.add(recipientId);
    }

    if (!senderIsAdmin) {
      // Route customer-initiated conversations to every admin so the message
      // actually lands in someone's inbox. Admins live in the dedicated
      // `admins` table (see lib/supabaseServer.ts::getAdminRoleFromDatabase),
      // not as profiles.role = "admin"/"super_admin" rows — querying profiles
      // here always came back empty, so customer messages were saved but
      // never reached anyone.
      const { data: adminRows } = await supabaseAdmin.from("admins").select("id, email, full_name");
      const adminIds = (adminRows ?? []).map((admin) => admin.id).filter(Boolean);

      if (adminIds.length > 0) {
        // communication_conversation_participants.profile_id is a foreign
        // key to profiles.id, but admins authenticate via the admins table
        // directly and don't always have a matching profiles row — backfill
        // a minimal one so adding them as a participant doesn't violate the
        // FK and silently fail the whole conversation insert.
        const { data: existingProfiles } = await supabaseAdmin.from("profiles").select("id").in("id", adminIds);
        const existingProfileIds = new Set((existingProfiles ?? []).map((p) => p.id));
        const missingProfiles = (adminRows ?? [])
          .filter((admin) => admin.id && !existingProfileIds.has(admin.id))
          .map((admin) => ({ id: admin.id, full_name: admin.full_name || admin.email, email: admin.email, role: "admin" }));

        if (missingProfiles.length > 0) {
          const { error: backfillError } = await supabaseAdmin.from("profiles").insert(missingProfiles);
          if (backfillError) {
            console.warn("Failed to backfill profiles for admin participants", backfillError.message);
          }
        }

        for (const adminId of adminIds) {
          participantIds.add(adminId);
        }
      }
    }

    const participantRows = Array.from(participantIds).map((profileId) => ({
      conversation_id: conversationData.id,
      profile_id: profileId,
      role: profileId === senderId ? "owner" : "member",
      deleted: false,
    }));

    const { error: participantError } = await supabaseAdmin.from("communication_conversation_participants").insert(participantRows);

    if (participantError) throw participantError;

    const { data: messageData, error: messageError } = await supabaseAdmin
      .from("communication_messages")
      .insert({
        conversation_id: conversationData.id,
        sender_id: senderId,
        body: messageBody,
        html: null,
        attachments: [],
      })
      .select()
      .single();

    if (messageError) throw messageError;

    const recipientNotifications = Array.from(participantIds)
      .filter((profileId) => profileId !== senderId)
      .map((profileId) => ({
        profile_id: profileId,
        type: "message",
        title: senderIsAdmin ? `New message: ${title}` : `New support message: ${title}`,
        message: messageBody.length > 180 ? `${messageBody.slice(0, 177)}...` : messageBody,
        priority: "normal",
        related_type: "conversation",
        related_id: conversationData.id,
        metadata: { conversation_id: conversationData.id, sender_name: senderProfile?.full_name || "Travel with Hawkins" },
      }));

    if (recipientNotifications.length > 0) {
      const { error: notificationError } = await supabaseAdmin.from("communication_notifications").insert(recipientNotifications);
      if (notificationError) {
        console.warn("Failed to create message notifications", notificationError.message);
      }
    }

    return NextResponse.json({ success: true, conversation: conversationData, message: messageData });
  } catch (err) {
    console.error("POST /api/communication/conversations error", err);
    return jsonError(getErrorMessage(err, "Unable to start conversation"), 500);
  }
}
