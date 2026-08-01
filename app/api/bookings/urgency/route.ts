import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Public, PII-free signal for the homepage "seats filling fast" banner.
// Returns only a destination string (or null) — never raw booking rows.
// Raw bookings (name/phone/email/fare) are admin-only via GET /api/bookings.
export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("destination, travel_date, seats")
      .gte("travel_date", today)
      .gte("seats", 11)
      .order("travel_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ success: true, destination: null });
    }

    return NextResponse.json({ success: true, destination: (data as Record<string, unknown>).destination ?? null });
  } catch {
    return NextResponse.json({ success: true, destination: null });
  }
}
