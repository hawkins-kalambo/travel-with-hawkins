import { jsPDF } from "jspdf";
import type { BookingRecord } from "@/lib/bookingTypes";
import { logoPngBase64 } from "./logoBase64";
import { formatMwk } from "./routePricing";

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

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, fontSize = 9) {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return lines.length * (fontSize + 1);
}

function buildReceiptDocument(booking: BookingRecord) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a5", compress: true });
  const margin = 24;
  const width = 420 - margin * 2;
  let y = 28;

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
  const fare = typeof booking.fare === "number" ? booking.fare : undefined;
  const logoBase64 = logoPngBase64 || null;

  doc.setTextColor("#1A0F00");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Travel with Hawkins", margin, y);

  if (logoBase64) {
    doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", margin + width - 46, y - 8, 38, 38);
  }

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#6B7280");
  doc.text("Professional student transport receipt", margin, y);

  y += 16;
  doc.setDrawColor("#E8650A");
  doc.setLineWidth(1);
  doc.line(margin, y, margin + width, y);

  y += 16;
  doc.setTextColor("#111827");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Official Payment Receipt", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#4B5563");
  doc.text(`Issued: ${formatDate(new Date())}`, margin + width - 95, y);

  y += 14;
  doc.setDrawColor("#E5E7EB");
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + width, y);

  y += 14;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, width, 88, 6, 6, "F");
  doc.setDrawColor("#E5E7EB");
  doc.roundedRect(margin, y, width, 88, 6, 6, "S");

  const boxPadding = 10;
  const leftColX = margin + boxPadding;
  const rightColX = margin + width / 2 + 6;
  let boxY = y + 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor("#111827");
  doc.text("Receipt Details", leftColX, boxY);

  boxY += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#374151");
  addWrappedText(doc, `Receipt No: ${receiptNumber}`, leftColX, boxY, width / 2 - 16, 8);
  boxY += 11;
  addWrappedText(doc, `Booking ID: ${bookingId}`, leftColX, boxY, width / 2 - 16, 8);
  boxY += 11;
  addWrappedText(doc, `Trip ID: ${tripId}`, leftColX, boxY, width / 2 - 16, 8);

  boxY = y + 12;
  doc.setFont("helvetica", "bold");
  doc.text("Passenger Details", rightColX, boxY);

  boxY += 10;
  doc.setFont("helvetica", "normal");
  addWrappedText(doc, `Name: ${studentName}`, rightColX, boxY, width / 2 - 16, 8);
  boxY += 11;
  addWrappedText(doc, `Student ID: ${studentId}`, rightColX, boxY, width / 2 - 16, 8);
  boxY += 11;
  addWrappedText(doc, `Phone: ${phone}`, rightColX, boxY, width / 2 - 16, 8);

  y += 104;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, width, 82, 6, 6, "F");
  doc.setDrawColor("#E5E7EB");
  doc.roundedRect(margin, y, width, 82, 6, 6, "S");

  boxY = y + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor("#111827");
  doc.text("Trip Information", margin + boxPadding, boxY);

  boxY += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#374151");
  addWrappedText(doc, `Route: ${destination}`, margin + boxPadding, boxY, width - 20, 8);
  boxY += 11;
  addWrappedText(doc, `Pickup: ${pickup}`, margin + boxPadding, boxY, width - 20, 8);
  boxY += 11;
  addWrappedText(doc, `Travel Date: ${travelDate}`, margin + boxPadding, boxY, width - 20, 8);
  boxY += 11;
  addWrappedText(doc, `Seats: ${seats} • Booking Type: ${bookingType}`, margin + boxPadding, boxY, width - 20, 8);

  y += 98;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, width, 44, 6, 6, "F");
  doc.setDrawColor("#E5E7EB");
  doc.roundedRect(margin, y, width, 44, 6, 6, "S");

  boxY = y + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor("#111827");
  doc.text("Payment Summary", margin + boxPadding, boxY);

  boxY += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#374151");
  addWrappedText(doc, `Status: ${paymentStatus}`, margin + boxPadding, boxY, width / 2 - 16, 8);
  addWrappedText(doc, `Confirmed: ${paymentConfirmedAt}`, margin + width / 2 + 4, boxY, width / 2 - 16, 8);
  boxY += 11;
  addWrappedText(doc, `Fare: ${fare != null ? formatMwk(fare) : "—"}`, margin + boxPadding, boxY, width / 2 - 16, 8);

  y += 60;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor("#6B7280");
  doc.text("This receipt confirms your payment and should be kept for your records.", margin, y);
  y += 10;
  doc.text("Support: +265 989 127 308 | smoothridemw@gmail.com", margin, y);

  return doc;
}

export function generateReceiptPdfBlob(booking: BookingRecord): Blob {
  return buildReceiptDocument(booking).output("blob");
}

export function generateReceiptPdfBase64(booking: BookingRecord): string {
  const dataUri = buildReceiptDocument(booking).output("datauristring");
  const prefix = "data:application/pdf;base64,";
  return dataUri.startsWith(prefix) ? dataUri.slice(prefix.length) : dataUri;
}
