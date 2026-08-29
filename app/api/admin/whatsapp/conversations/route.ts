import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { requireWhatsAppAdmin } from "@/lib/whatsapp/admin";
import { filterToQuery, isInboxFilter, previewFor } from "@/lib/whatsapp/inbox";

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const url = new URL(req.url);

  const filterParam = url.searchParams.get("filter");
  const legacyStatus = url.searchParams.get("status");
  const search = (url.searchParams.get("q") || "").trim().toLowerCase();
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("limit")) || PAGE_SIZE));

  // `filter` (UI chips) supersedes the legacy `status` param but both work.
  const constraint = isInboxFilter(filterParam)
    ? filterToQuery(filterParam)
    : (legacyStatus && ["bot_controlled", "waiting", "human_controlled", "resolved"].includes(legacyStatus) ? { status: legacyStatus } : {});

  let query = supabaseAdmin.from("whatsapp_conversations").select(
    "conversation_id,mode,status,assigned_to,state_step,last_message_at,last_customer_message_at,last_message_preview,unread_count,contact:whatsapp_contacts(id,wa_id,display_name,language,consent_status)"
  ).order("last_message_at", { ascending: false }).limit(limit + 1);
  if (constraint.status) query = query.eq("status", constraint.status);
  if (constraint.unreadOnly) query = query.gt("unread_count", 0);
  if (cursor) query = query.lt("last_message_at", cursor);

  const result = await query;
  if (result.error) return jsonError("Unable to load WhatsApp conversations", 500);

  const rows = result.data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const ids = page.map((row) => row.conversation_id);

  const operations = ids.length
    ? await supabaseAdmin.from("whatsapp_booking_operations").select("conversation_id,booking_id").in("conversation_id", ids)
    : { data: [] as { conversation_id: string; booking_id: string }[] };
  const bookingIdByConversation = new Map((operations.data ?? []).map((row) => [row.conversation_id, row.booking_id]));

  const contactOf = (row: Record<string, unknown>) => (Array.isArray(row.contact) ? row.contact[0] : row.contact) as Record<string, unknown> | undefined;
  const phones = page.map((row) => contactOf(row)?.wa_id).filter(Boolean) as string[];
  const contactBookings = phones.length
    ? await supabaseAdmin.from("bookings").select("booking_id,phone,created_at").in("phone", phones).order("created_at", { ascending: false })
    : { data: [] as { booking_id: string; phone: string }[] };
  const bookingByPhone = new Map<string, string>();
  for (const booking of contactBookings.data ?? []) if (!bookingByPhone.has(booking.phone)) bookingByPhone.set(booking.phone, booking.booking_id);

  const agentIds = Array.from(new Set(page.map((row) => row.assigned_to).filter(Boolean))) as string[];
  const agents = agentIds.length
    ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", agentIds)
    : { data: [] as { id: string; full_name?: string; email?: string }[] };
  const agentName = new Map((agents.data ?? []).map((a) => [a.id, a.full_name || a.email || a.id]));

  let conversations = page.map((row) => {
    const contact = contactOf(row);
    return {
      conversation_id: row.conversation_id,
      mode: row.mode,
      status: row.status,
      assigned_to: row.assigned_to ?? null,
      assigned_agent_name: row.assigned_to ? agentName.get(row.assigned_to) || null : null,
      last_message_at: row.last_message_at,
      last_customer_message_at: row.last_customer_message_at ?? null,
      preview: previewFor(row.last_message_preview, 120),
      unread_count: Number(row.unread_count) || 0,
      contact,
      bookingId: bookingIdByConversation.get(row.conversation_id) || bookingByPhone.get(String(contact?.wa_id || "")) || null,
    };
  });

  if (search) {
    conversations = conversations.filter((row) => {
      const contact = row.contact as Record<string, unknown> | undefined;
      return `${contact?.display_name || ""} ${contact?.wa_id || ""} ${row.bookingId || ""} ${row.status} ${row.preview}`.toLowerCase().includes(search);
    });
  }

  const nextCursor = hasMore ? page[page.length - 1]?.last_message_at ?? null : null;
  return NextResponse.json({ success: true, conversations, nextCursor });
}
