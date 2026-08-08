import { NextResponse } from "next/server";

// The single legacy payment_status field could not distinguish the compulsory
// booking fee from the transport fare. All payment settlement now goes through
// the booking-fee/fare endpoints and verified payment finalization flow.
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Legacy payment confirmation has been retired. Use the booking-fee or fare payment workflow.",
    },
    { status: 410 }
  );
}
