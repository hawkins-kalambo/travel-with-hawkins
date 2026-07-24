import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser, requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { publishCommunicationEvent } from "@/lib/communicationEngine";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  const { authorized } = await requireAdminUser(req, response);
  try {
    const query = supabaseAdmin.from("communication_support_tickets").select("*, profiles(full_name, email)").order("created_at", { ascending: false });

    if (!authorized) {
      query.eq("requester_id", authUser.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, tickets: data ?? [] });
  } catch (err) {
    console.error("GET /api/communication/tickets error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to load tickets", 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  try {
    const body = await req.json();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category = typeof body.category === "string" ? body.category : "general";

    if (!subject || !description) {
      return jsonError("Subject and description are required", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("communication_support_tickets")
      .insert({
        subject,
        description,
        category,
        requester_id: authUser.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    await publishCommunicationEvent({
      type: "support_ticket_created",
      actor_id: authUser.user.id,
      payload: {
        requester_id: authUser.user.id,
        ticket_id: data?.id ?? "",
        subject,
        assignee_ids: [],
      },
    });

    return NextResponse.json({ success: true, ticket: data });
  } catch (err) {
    console.error("POST /api/communication/tickets error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to create ticket", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user } = await requireAdminUser(req, response);
  if (!authorized || !user) return jsonError("Admin access required", 401);

  try {
    const body = await req.json();
    const ticketId = typeof body.id === "string" ? body.id : "";
    const updates: Record<string, unknown> = {};

    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.priority === "string") updates.priority = body.priority;
    if (typeof body.assignee_id === "string") updates.assignee_id = body.assignee_id;

    if (!ticketId || Object.keys(updates).length === 0) {
      return jsonError("Ticket ID and at least one update field required", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("communication_support_tickets")
      .update(updates)
      .eq("id", ticketId)
      .select()
      .single();

    if (error) throw error;

    if (updates.assignee_id) {
      await publishCommunicationEvent({
        type: "support_ticket_assigned",
        actor_id: user.id,
        payload: {
          assignee_id: String(updates.assignee_id),
          ticket_id: ticketId,
          subject: String(data?.subject ?? "Support ticket"),
        },
      });
    }

    return NextResponse.json({ success: true, ticket: data });
  } catch (err) {
    console.error("PATCH /api/communication/tickets error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to update ticket", 500);
  }
}
