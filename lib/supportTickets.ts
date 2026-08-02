import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { publishCommunicationEvent } from "@/lib/communicationEngine";

// Shared implementation for the two support-ticket routes
// (app/api/communication/tickets/route.ts, used by the ambassador ticket
// form, and app/api/support-tickets/route.ts, used by the admin support
// desk). They were previously two independent copies of the same logic
// that had quietly diverged: only the ambassador-facing route called
// publishCommunicationEvent, so admin-side status/assignee changes (the
// far more common path in practice) never notified anyone. Centralizing
// here means both routes always behave identically.

export async function listTickets(requesterId: string, isAdmin: boolean) {
  const query = supabaseAdmin.from("communication_support_tickets").select("*, profiles(full_name, email)").order("created_at", { ascending: false });

  if (!isAdmin) {
    query.eq("requester_id", requesterId);
  }

  return query;
}

export async function createTicket(params: { requesterId: string; subject: string; description: string; category: string }) {
  const result = await supabaseAdmin
    .from("communication_support_tickets")
    .insert({
      subject: params.subject,
      description: params.description,
      category: params.category,
      requester_id: params.requesterId,
    })
    .select()
    .single();

  if (!result.error && result.data) {
    await publishCommunicationEvent({
      type: "support_ticket_created",
      actor_id: params.requesterId,
      payload: {
        requester_id: params.requesterId,
        ticket_id: result.data.id,
        subject: params.subject,
        assignee_ids: [],
      },
    });
  }

  return result;
}

export async function updateTicket(params: { ticketId: string; actorId: string; status?: string; priority?: string; assigneeId?: string }) {
  const updates: Record<string, unknown> = {};
  if (params.status) updates.status = params.status;
  if (params.priority) updates.priority = params.priority;
  if (params.assigneeId) updates.assignee_id = params.assigneeId;

  if (Object.keys(updates).length === 0) {
    return { data: null, error: { message: "At least one update field is required" } };
  }

  const result = await supabaseAdmin.from("communication_support_tickets").update(updates).eq("id", params.ticketId).select().single();

  if (!result.error && result.data && params.assigneeId) {
    await publishCommunicationEvent({
      type: "support_ticket_assigned",
      actor_id: params.actorId,
      payload: {
        assignee_id: params.assigneeId,
        ticket_id: params.ticketId,
        subject: String(result.data.subject ?? "Support ticket"),
      },
    });
  }

  return result;
}
