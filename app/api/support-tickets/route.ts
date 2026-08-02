import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser, requireAuthenticatedUser } from "@/lib/supabaseServer";
import { listTickets, createTicket, updateTicket } from "@/lib/supportTickets";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  try {
    const { authorized } = await requireAdminUser(req, response);
    const { data, error } = await listTickets(authUser.user.id, authorized);

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

    const { data, error } = await createTicket({ requesterId: authUser.user.id, subject, description, category });

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
    if (!ticketId) return jsonError("Ticket ID is required", 400);

    // Fixes a bug found while auditing the communications system: this
    // route previously updated status/priority/assignee directly and
    // never called publishCommunicationEvent, so admin-side ticket
    // assignment — the only place in the whole app an admin could actually
    // assign a ticket — never notified the assignee. Delegating to the
    // same updateTicket() the ambassador-facing route uses closes that gap.
    const { data, error } = await updateTicket({
      ticketId,
      actorId: user.id,
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      assigneeId: typeof body.assignee_id === "string" ? body.assignee_id : undefined,
    });

    if (error) throw error;
    return NextResponse.json({ success: true, ticket: data });
  } catch (error) {
    console.error("PATCH /api/support-tickets error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to update ticket", 500);
  }
}
