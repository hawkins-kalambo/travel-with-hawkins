import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { requireWhatsAppAdmin } from "@/lib/whatsapp/admin";

export async function GET(req: NextRequest) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("q") || "").trim().toLowerCase();
  let query = supabaseAdmin.from("whatsapp_conversations").select(
    "conversation_id,mode,status,assigned_to,state_step,last_message_at,contact:whatsapp_contacts(id,wa_id,display_name,language,consent_status),conversation:communication_conversations(id,title,updated_at)"
  ).order("last_message_at", { ascending: false }).limit(100);
  if (status && ["bot_controlled", "waiting", "human_controlled", "resolved"].includes(status)) query = query.eq("status", status);
  const result = await query;
  if (result.error) return jsonError("Unable to load WhatsApp conversations", 500);
  const ids = (result.data ?? []).map((row) => row.conversation_id);
  const operations = ids.length ? await supabaseAdmin.from("whatsapp_booking_operations").select("conversation_id,booking_id").in("conversation_id", ids) : { data: [] };
  const bookingIds = new Map((operations.data ?? []).map((row) => [row.conversation_id, row.booking_id]));
  const phones = (result.data ?? []).map((row) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    return contact?.wa_id;
  }).filter(Boolean);
  const contactBookings = phones.length ? await supabaseAdmin.from("bookings").select("booking_id,phone,created_at").in("phone", phones).order("created_at", { ascending: false }) : { data: [] };
  const bookingByPhone = new Map<string, string>();
  for (const booking of contactBookings.data ?? []) if (!bookingByPhone.has(booking.phone)) bookingByPhone.set(booking.phone, booking.booking_id);
  const conversations = (result.data ?? []).map((row) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    return { ...row, bookingId: bookingIds.get(row.conversation_id) || bookingByPhone.get(contact?.wa_id || "") || null };
  }).filter((row) => {
    if (!search) return true;
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    return `${contact?.display_name || ""} ${contact?.wa_id || ""} ${row.bookingId || ""} ${row.status}`.toLowerCase().includes(search);
  });
  return NextResponse.json({ success: true, conversations });
}
