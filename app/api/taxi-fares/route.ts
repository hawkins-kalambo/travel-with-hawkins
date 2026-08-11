import { NextResponse } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Public, unauthenticated — mirrors GET /api/routes, which the intercity
// trip search already relies on to browse bookable options before a
// customer signs in for anything.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("taxi_fares")
    .select("id, origin_label, destination_label, fare, operator:operators(id, display_name, status)")
    .eq("status", "active")
    .order("origin_label", { ascending: true });

  if (error) return jsonError("Unable to load taxi fares", 500);

  const fares = (data ?? [])
    .filter((row) => (row.operator as unknown as { status?: string } | null)?.status === "active")
    .map((row) => {
      const operator = row.operator as unknown as { id: string; display_name: string };
      return {
        id: row.id,
        originLabel: row.origin_label,
        destinationLabel: row.destination_label,
        fare: row.fare,
        operatorId: operator.id,
        operatorDisplayName: operator.display_name,
      };
    });

  return NextResponse.json({ success: true, taxiFares: fares });
}
