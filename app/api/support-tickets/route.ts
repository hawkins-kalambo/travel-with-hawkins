import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser, requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  try {
    const { authorized } = await requireAdminUser(req, response);
    const query = supabaseAdmin
      .from("communication_support_tickets")
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false });

    if (!authorized) {
      // Non-admins only see their own tickets
      query.eq("requester_id", authUser.user.id);
    }

    const { data, error } = await query;

    if (error) {
      if (error.message?.includes("does not exist")) {
        return NextResponse.json({ success: true, tickets: [] });
      }
      throw error;
    }

    return NextResponse.json({ success: true, tickets: data ?? [] });
  } catch (error) {
    console.error("GET /api/support-tickets error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to load tickets", 500);
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

    if (error) {
      if (error.message?.includes("does not exist")) {
        return jsonError("Communication system not yet initialized", 500);
      }
      throw error;
    }

    return NextResponse.json({ success: true, ticket: data });
  } catch (error) {
    console.error("POST /api/support-tickets error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to create ticket", 500);
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

    if (body.status) updates.status = body.status;
    if (body.priority) updates.priority = body.priority;
    if (body.assignee_id) updates.assignee_id = body.assignee_id;

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
    return NextResponse.json({ success: true, ticket: data });
  } catch (error) {
    console.error("PATCH /api/support-tickets error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to update ticket", 500);
  }
}
