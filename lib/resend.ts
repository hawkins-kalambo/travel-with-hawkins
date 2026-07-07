import { Resend } from "resend";
import type { Attachment } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const DEFAULT_FROM_ADDRESS = "Travel with Hawkins <onboarding@resend.dev>";

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_ADDRESS;
}

export async function sendEmail({
  to,
  subject,
  html,
  from,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: Array<{
    content: string | Buffer;
    filename?: string;
    content_type?: string;
  }>;
}) {
  if (!resend) {
    const error = new Error("Resend email skipped because RESEND_API_KEY is not configured.");
    console.error(error.message);
    return { success: false, error };
  }

  const resolvedFrom = from || getFromAddress();

  console.log("RESEND EMAIL ATTEMPT:", {
    to,
    subject,
    from: resolvedFrom,
    attachments: attachments?.map((attachment) => attachment.filename),
  });

  try {
    const normalizedAttachments = attachments?.map((attachment) => ({
      content: typeof attachment.content === "string" ? attachment.content : Buffer.from(attachment.content),
      filename: attachment.filename,
      contentType: attachment.content_type,
    })) as Attachment[] | undefined;

    const response = await resend.emails.send({
      from: resolvedFrom,
      to,
      subject,
      html,
      attachments: normalizedAttachments,
    });

    console.log("RESEND EMAIL RESULT:", response);
    return { success: true, data: response };
  } catch (error) {
    console.error("Resend email failed:", error);
    return { success: false, error };
  }
}

export async function sendBookingEmail({
  to,
  name,
  destination,
  travelDate,
  seats,
  fare,
}: {
  to: string;
  name: string;
  destination: string;
  travelDate: string;
  seats: number;
  fare?: number;
}) {
  return sendEmail({
    from: DEFAULT_FROM_ADDRESS,
    to,
    subject: "Booking Confirmation - Travel with Hawkins",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color:#1a0f00;">Booking Confirmed 🚐</h2>

        <p>Hello <b>${name}</b>,</p>

        <p>Your booking has been successfully received.</p>

        <h3>Trip Details</h3>
        <ul>
          <li><b>Destination:</b> ${destination}</li>
          <li><b>Travel Date:</b> ${travelDate}</li>
          <li><b>Seats:</b> ${seats}</li>
          <li><b>Fare:</b> ${fare != null ? `MWK ${fare.toLocaleString("en-MW")}` : "Pending"}</li>
        </ul>

        <p>Status: <b>Pending Confirmation</b></p>

        <hr />

        <p style="font-size:12px;color:gray;">
          Travel with Hawkins - Safe and Reliable Transport
        </p>
      </div>
    `,
  });
}