import { NextResponse, type NextRequest } from "next/server";
import { generateReceiptPdfBase64 } from "@/lib/receiptGenerator";
import { loadLatestReceipt, type ReceiptPaymentType } from "@/lib/payments/receipt-service";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authResponse = NextResponse.next();
  const auth = await requireUniversityOperationsUser(request, authResponse, "viewBookings");
  if (!auth.authorized) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const bookingId = request.nextUrl.searchParams.get("bookingId")?.trim() || "";
  const paymentType = request.nextUrl.searchParams.get("paymentType") as ReceiptPaymentType | null;
  if (!bookingId || !paymentType || !["booking_fee", "transport_fare"].includes(paymentType)) {
    return NextResponse.json({ success: false, error: "Valid bookingId and paymentType are required" }, { status: 400 });
  }

  let bookingScopeQuery = supabaseAdmin.from("bookings").select("booking_id").eq("booking_id", bookingId);
  if (!auth.isGlobal) bookingScopeQuery = bookingScopeQuery.in("university_id", auth.universityIds);
  const { data: scopedBooking } = await bookingScopeQuery.maybeSingle();
  if (!scopedBooking) return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });

  const loaded = await loadLatestReceipt(bookingId, paymentType);
  if (!loaded) return NextResponse.json({ success: false, error: "Paid payment record not found" }, { status: 404 });

  const bytes = Buffer.from(generateReceiptPdfBase64(loaded.receipt), "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${loaded.receipt.receiptNumber || "receipt"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
