import { sendEmail } from "@/lib/resend";

const CONTACT_RECIPIENT = "travelwithhawkins@gmail.com";
const MAX_REQUEST_BYTES = 16_000;

type ContactFields = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

function normalizeMessage(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim()
    : "";
}

function normalizeSingleLine(value: unknown) {
  return normalizeMessage(value).replace(/\s+/g, " ");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validateFields(body: unknown):
  | { fields: ContactFields; error?: never }
  | { fields?: never; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Please complete all contact form fields." };
  }

  const record = body as Record<string, unknown>;
  const fields = {
    name: normalizeSingleLine(record.name),
    email: normalizeSingleLine(record.email).toLowerCase(),
    subject: normalizeSingleLine(record.subject),
    message: normalizeMessage(record.message),
  };

  if (!fields.name || !fields.email || !fields.subject || !fields.message) {
    return { error: "Please complete all contact form fields." };
  }
  if (fields.name.length > 100) {
    return { error: "Please enter a shorter name." };
  }
  if (
    fields.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
    /[\r\n]/.test(fields.email)
  ) {
    return { error: "Please enter a valid email address." };
  }
  if (fields.subject.length > 160) {
    return { error: "Please enter a shorter subject." };
  }
  if (fields.message.length > 5_000) {
    return { error: "Please shorten your message to 5,000 characters or fewer." };
  }

  return { fields };
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Your message is too large to send." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Please submit a valid contact form." }, { status: 400 });
  }

  const result = validateFields(body);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const { name, email, subject, message } = result.fields;
  const emailResult = await sendEmail({
    to: CONTACT_RECIPIENT,
    replyTo: email,
    subject: `Website contact: ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2>New website contact message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Message:</strong></p>
        <div style="white-space: pre-wrap;">${escapeHtml(message)}</div>
      </div>
    `,
  });

  if (!emailResult.success) {
    return Response.json(
      { error: "We could not send your message right now. Please try again later." },
      { status: 500 },
    );
  }

  return Response.json({ message: "Thanks! Your message has been sent." });
}
