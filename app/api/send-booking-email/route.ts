import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      name,
      phone,
      studentId,
      destination,
      travelDate,
      seats,
      pickup,
      bookingId,
    } = body;

    const email = process.env.ADMIN_NOTIFICATION_EMAIL;

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Missing admin email" },
        { status: 500 }
      );
    }

    const result = await sendEmail({
      to: email,
      subject: "🚐 New Booking Received - Travel with Hawkins",
      html: `
        <div style="font-family: Arial; padding: 16px;">
          <h2 style="color:#1a0f00;">New Booking Alert</h2>

          <p><b>Booking ID:</b> ${bookingId || "N/A"}</p>
          <p><b>Name:</b> ${name}</p>
          <p><b>Student ID:</b> ${studentId}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Destination:</b> ${destination}</p>
          <p><b>Travel Date:</b> ${travelDate}</p>
          <p><b>Seats:</b> ${seats}</p>
          <p><b>Pickup:</b> ${pickup}</p>

          <hr />
          <p style="font-size:12px;color:gray;">
            Travel with Hawkins System Notification
          </p>
        </div>
      `,
    });

    if (!result.success) {
      console.error("Admin notification via legacy route failed", result.error);
      return NextResponse.json({ success: false, error: "Email failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Email error:", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}