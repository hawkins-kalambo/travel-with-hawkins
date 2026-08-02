import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser, requireAdminUser } from "@/lib/supabaseServer";
import { listTickets, createTicket, updateTicket } from "@/lib/supportTickets";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  const { authorized } = await requireAdminUser(req, response);
  try {
    const { data, error } = await listTickets(authUser.user.id, authorized);
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

    const { data, error } = await createTicket({ requesterId: authUser.user.id, subject, description, category });
    if (error) throw error;

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
    if (!ticketId) return jsonError("Ticket ID is required", 400);

    const { data, error } = await updateTicket({
      ticketId,
      actorId: user.id,
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      assigneeId: typeof body.assignee_id === "string" ? body.assignee_id : undefined,
    });

    if (error) throw error;
    return NextResponse.json({ success: true, ticket: data });
  } catch (err) {
    console.error("PATCH /api/communication/tickets error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to update ticket", 500);
  }
}
