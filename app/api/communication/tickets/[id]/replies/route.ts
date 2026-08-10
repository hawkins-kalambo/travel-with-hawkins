import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser, requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";

// Fixes a gap found while auditing the communications system: there was no
// way to reply to a support ticket anywhere — no UI, no route — on either
// the admin or ambassador/customer side, despite a `communication_ticket_replies`
// table already existing (unused) in one of the old migration files. This
// route, plus db/migrations/2026_08_01_reconcile_communication_center.sql
// (which formally builds out that table with real indexes/RLS), and the
// small UI additions in app/admin/communication/support-tickets.tsx and
// app/ambassador/communication/page.tsx complete the feature end-to-end.

async function canAccessTicket(ticketId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const { data } = await supabaseAdmin.from("communication_support_tickets").select("id").eq("id", ticketId).eq("requester_id", userId).maybeSingle();
  return Boolean(data);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  const { id: ticketId } = await params;
  const { authorized: isAdmin } = await requireAdminUser(req, response);

  try {
    if (!(await canAccessTicket(ticketId, authUser.user.id, isAdmin))) {
      return jsonError("Ticket not found", 404);
    }

    const { data, error } = await supabaseAdmin
      .from("communication_ticket_replies")
      .select("id, ticket_id, author_id, body, created_at, profiles(full_name, email)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, replies: data ?? [] });
  } catch (err) {
    console.error("GET /api/communication/tickets/[id]/replies error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to load replies", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) return jsonError("Authentication required", 401);

  const { id: ticketId } = await params;
  const { authorized: isAdmin } = await requireAdminUser(req, response);

  try {
    if (!(await canAccessTicket(ticketId, authUser.user.id, isAdmin))) {
      return jsonError("Ticket not found", 404);
    }

    const body = await req.json();
    const replyBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!replyBody) return jsonError("Reply text is required", 400);

    const { data, error } = await supabaseAdmin
      .from("communication_ticket_replies")
      .insert({ ticket_id: ticketId, author_id: authUser.user.id, body: replyBody })
      .select("id, ticket_id, author_id, body, created_at, profiles(full_name, email)")
      .single();

    if (error) throw error;

    // A reply is a meaningful update — bump the ticket's updated_at so it
    // surfaces near the top of any "recently active" sort, same as a
    // status change would.
    await supabaseAdmin.from("communication_support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticketId);

    return NextResponse.json({ success: true, reply: data });
  } catch (err) {
    console.error("POST /api/communication/tickets/[id]/replies error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to post reply", 500);
  }
}
