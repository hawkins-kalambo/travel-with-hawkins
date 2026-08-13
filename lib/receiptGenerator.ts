import { jsPDF } from "jspdf";
import type { BookingRecord } from "@/lib/bookingTypes";
import { logoPngBase64 } from "./logoBase64";
import { formatMwk } from "./routePricing";

export type PaymentReceiptRecord = BookingRecord & {
  receiptPaymentType?: "booking_fee" | "transport_fare";
  receiptAmount?: number;
  receiptCurrency?: string;
  receiptPaymentMethod?: string;
  receiptPaymentReference?: string;
};

// Brand palette — must stay in sync with the CSS custom properties in
// app/globals.css (--navy-midnight, --orange, --orange-soft). jsPDF runs
// outside the browser/CSS cascade, so these are duplicated by value here.
const NAVY = "#0B1931";
const ORANGE = "#F56600";
const ORANGE_SOFT = "#FFF1E8";
const TEXT_MUTED = "#374151";
const TEXT_FAINT = "#6B7280";
const BORDER = "#E5E7EB";
const PANEL = "#F8FAFC";

function safeText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

function formatDate(value: string | Date | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

const FIELD_FONT_SIZE = 8;
const FIELD_LINE_GAP = 4;
const BOX_CONTENT_TOP = 28; // distance from box top to first field's baseline
const BOX_BOTTOM_PAD = 12;

// Pure measurement (splitTextToSize only — never calls text()) so a box's
// height can be computed BEFORE it's drawn, and content drawn immediately
// after always agrees with it exactly. A fixed per-field pixel increment
// (the box's previous design) silently breaks the moment any field wraps to
// a second line — which real receipt numbers (e.g.
// "TWH-BOOKINGFEE-3f3144bf06fa3f997945c070b7ad9c4b") do — and the next
// field then overlaps it.
function measureFieldListHeight(doc: jsPDF, fields: string[], maxWidth: number, fontSize = FIELD_FONT_SIZE): number {
  doc.setFontSize(fontSize);
  return fields.reduce((total, field) => total + doc.splitTextToSize(field, maxWidth).length * (fontSize + 1) + FIELD_LINE_GAP, 0);
}

function drawFieldList(doc: jsPDF, fields: string[], x: number, startY: number, maxWidth: number, fontSize = FIELD_FONT_SIZE) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(TEXT_MUTED);
  let fieldY = startY;
  for (const field of fields) {
    const lines = doc.splitTextToSize(field, maxWidth);
    doc.text(lines, x, fieldY);
    fieldY += lines.length * (fontSize + 1) + FIELD_LINE_GAP;
  }
}

// A titled panel that sizes itself to its own content and returns the
// height it actually used, so callers chain `y += drawInfoBox(...) + gap`
// instead of guessing a height up front.
function drawInfoBox(doc: jsPDF, { x, y, width, title, fields }: { x: number; y: number; width: number; title: string; fields: string[] }): number {
  const fieldWidth = width - 20;
  const measured = measureFieldListHeight(doc, fields, fieldWidth);
  const boxHeight = BOX_CONTENT_TOP + (measured - FIELD_LINE_GAP) + BOX_BOTTOM_PAD;

  doc.setFillColor(PANEL);
  doc.roundedRect(x, y, width, boxHeight, 6, 6, "F");
  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, width, boxHeight, 6, 6, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(NAVY);
  doc.text(title, x + 10, y + 15);

  drawFieldList(doc, fields, x + 10, y + BOX_CONTENT_TOP, fieldWidth);

  return boxHeight;
}

function buildReceiptDocument(booking: PaymentReceiptRecord) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a5", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 24;
  const width = pageWidth - margin * 2;

  const receiptNumber = safeText(booking.receiptNumber);
  const bookingId = safeText(booking.bookingId);
  const tripId = safeText(booking.tripId);
  const studentName = safeText(booking.name);
  const studentId = safeText(booking.studentId);
  const phone = safeText(booking.phone);
  const destination = safeText(booking.destination);
  const pickup = safeText(booking.pickup);
  const travelDate = safeText(booking.travelDate);
  const seats = String(booking.seats ?? 1);
  const paymentStatus = safeText(booking.paymentStatus);
  const paymentConfirmedAt = formatDate(booking.paymentConfirmedAt);
  const bookingType = safeText(booking.bookingType);
  const amount = typeof booking.receiptAmount === "number" ? booking.receiptAmount : typeof booking.fare === "number" ? booking.fare : undefined;
  const paymentLabel = booking.receiptPaymentType === "booking_fee" ? "Booking Fee" : booking.receiptPaymentType === "transport_fare" ? "Transport Fare" : "Payment";
  const paymentMethod = safeText(booking.receiptPaymentMethod);
  const paymentReference = safeText(booking.receiptPaymentReference);
  const logoBase64 = logoPngBase64 || null;

  // ---- Header band: brand navy, full-bleed, with a thin orange top edge ----
  const headerHeight = 92;
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageWidth, headerHeight, "F");
  doc.setFillColor(ORANGE);
  doc.rect(0, 0, pageWidth, 4, "F");

  const logoSize = 46;
  const logoX = margin;
  const logoY = (headerHeight - logoSize) / 2 + 2;
  if (logoBase64) {
    doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", logoX, logoY, logoSize, logoSize);
  }

  const titleX = logoBase64 ? logoX + logoSize + 12 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor("#FFFFFF");
  doc.text("Travel with Hawkins", titleX, headerHeight / 2 - 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#FFC89B");
  doc.text("Official Payment Receipt", titleX, headerHeight / 2 + 11);

  // Receipt number deliberately isn't repeated here — it's long (tx-ref
  // style, e.g. "TWH-BOOKINGFEE-3f3144bf06fa3f997945c070b7ad9c4b") and at
  // header width collided with the title. It's shown once, in full, in the
  // Receipt Details panel below.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor("#C7D2E8");
  doc.text(`Issued: ${formatDate(new Date())}`, margin + width, headerHeight / 2 + 4, { align: "right" });

  let y = headerHeight + 24;

  // ---- Amount highlight strip — the single most-scanned figure on a receipt ----
  const amountBoxHeight = 48;
  doc.setFillColor(ORANGE_SOFT);
  doc.roundedRect(margin, y, width, amountBoxHeight, 8, 8, "F");
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.75);
  doc.roundedRect(margin, y, width, amountBoxHeight, 8, 8, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(NAVY);
  doc.text(`${paymentLabel.toUpperCase()} — ${paymentStatus}`, margin + 14, y + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(ORANGE);
  doc.text(amount != null ? formatMwk(amount) : "—", margin + 14, y + 39);

  y += amountBoxHeight + 14;

  // ---- Receipt Details / Passenger Details / Trip Information / Payment Summary ----
  // Each box measures its own field list (including wraps) before drawing,
  // so a long value never collides with the box below it.
  y += drawInfoBox(doc, {
    x: margin,
    y,
    width,
    title: "Receipt Details",
    fields: [`Receipt No: ${receiptNumber}`, `Booking ID: ${bookingId}`, `Trip ID: ${tripId}`],
  }) + 14;

  y += drawInfoBox(doc, {
    x: margin,
    y,
    width,
    title: "Passenger Details",
    fields: [`Name: ${studentName}`, `Student ID: ${studentId}`, `Phone: ${phone}`],
  }) + 14;

  y += drawInfoBox(doc, {
    x: margin,
    y,
    width,
    title: "Trip Information",
    fields: [`Route: ${destination}`, `Pickup: ${pickup}`, `Travel Date: ${travelDate}`, `Seats: ${seats} • Booking Type: ${bookingType}`],
  }) + 14;

  y += drawInfoBox(doc, {
    x: margin,
    y,
    width,
    title: "Payment Summary",
    fields: [`Method: ${paymentMethod}`, `Confirmed: ${paymentConfirmedAt}`, `Reference: ${paymentReference}`],
  }) + 18;

  // ---- Footer ----
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(1.25);
  doc.line(margin, y, margin + width, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(TEXT_FAINT);
  doc.text("Thank you for traveling with Travel with Hawkins. This receipt confirms your payment", margin, y);
  y += 10;
  doc.text("and should be kept for your records.", margin, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(NAVY);
  doc.text("Support: +265 989 127 308  |  contact@travelwithhawkins.com", margin, y);

  return doc;
}

export function generateReceiptPdfBlob(booking: PaymentReceiptRecord): Blob {
  return buildReceiptDocument(booking).output("blob");
}

// Deliberately NOT using jsPDF's own "datauristring"/"dataurlstring" output
// mode here. In jsPDF v4's Node build, that mode prefixes the data URI with
// "data:application/pdf;filename=generated.pdf;base64," (note the extra
// filename= segment) rather than the "data:application/pdf;base64," this
// function used to assume — so the naive prefix-strip silently failed and
// returned the whole malformed URI as if it were the base64 payload, which
// Node's Buffer.from(..., "base64") then decoded into a handful of garbage
// bytes (decoding stops at the first "=" padding character, and
// "filename=" has one almost immediately). Every server-generated receipt
// — admin downloads and emailed receipts alike — was corrupted by this.
// Going through raw bytes instead sidesteps data-URI prefix formats
// entirely.
export function generateReceiptPdfBase64(booking: PaymentReceiptRecord): string {
  const arrayBuffer = buildReceiptDocument(booking).output("arraybuffer") as ArrayBuffer;
  return Buffer.from(arrayBuffer).toString("base64");
}
