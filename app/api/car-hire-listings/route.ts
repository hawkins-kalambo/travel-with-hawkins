import { NextResponse } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Public, unauthenticated — mirrors GET /api/taxi-fares.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("car_hire_listings")
    .select(
      "id, daily_rate, driver_included, operator:operators(id, display_name, status), vehicle:vehicles(registration_number, make, model, capacity)"
    )
    .eq("status", "active")
    .order("daily_rate", { ascending: true });

  if (error) return jsonError("Unable to load car hire listings", 500);

  const listings = (data ?? [])
    .filter((row) => (row.operator as unknown as { status?: string } | null)?.status === "active")
    .map((row) => {
      const operator = row.operator as unknown as { id: string; display_name: string };
      const vehicle = row.vehicle as unknown as { registration_number: string; make: string | null; model: string | null; capacity: number | null };
      return {
        id: row.id,
        dailyRate: row.daily_rate,
        driverIncluded: row.driver_included,
        operatorId: operator.id,
        operatorDisplayName: operator.display_name,
        vehicleLabel: [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.registration_number,
        capacity: vehicle.capacity,
      };
    });

  return NextResponse.json({ success: true, carHireListings: listings });
}
