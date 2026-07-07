import { jsPDF } from "jspdf";
import type { BookingRecord } from "@/lib/bookingTypes";
import { logoPngBase64 } from "./logoBase64";

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

const logoBase64 = logoPngBase64 || null;

function buildReceiptDocument(booking: BookingRecord) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const width = 595 - margin * 2;
  const halfWidth = width / 2 - 12;
  let y = 40;

  const receiptTitle = "Travel with Hawkins";
  const receiptSubtitle = "Professional Student Transport Services";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor("#1A0F00");
  doc.text(receiptTitle, margin, y);

  if (logoBase64) {
    doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", margin + width - 70, 30, 60, 60);
  }

  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#666666");
  doc.text(receiptSubtitle, margin, y);

  y += 28;
  doc.setDrawColor("#E8650A");
  doc.setLineWidth(1.5);
  doc.line(margin, y, margin + width, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor("#1A0F00");
  doc.text("OFFICIAL RECEIPT", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#444444");
  doc.text(`Date: ${formatDate(new Date())}`, margin + width - 140, y);

  y += 18;
  doc.setDrawColor("#E8650A");
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + width, y);
  y += 24;

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

  const sectionGap = 18;
  const sectionHeight = 92;

  doc.setFillColor(248, 247, 245);
  doc.rect(margin, y, width, sectionHeight, "F");
  doc.setDrawColor("#E2D5C0");
  doc.rect(margin, y, width, sectionHeight, "S");

  const sectionPadding = 12;
  let sectionY = y + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#1A0F00");
  doc.text("Receipt Details", margin + sectionPadding, sectionY);

  sectionY += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#333333");
  doc.text("Receipt Number:", margin + sectionPadding, sectionY);
  doc.text(receiptNumber, margin + sectionPadding + 110, sectionY);
  doc.text("Booking ID:", margin + halfWidth + sectionPadding, sectionY);
  doc.text(bookingId, margin + halfWidth + sectionPadding + 88, sectionY);

  sectionY += 14;
  doc.text("Trip ID:", margin + sectionPadding, sectionY);
  doc.text(tripId, margin + sectionPadding + 110, sectionY);
  doc.text("Status:", margin + halfWidth + sectionPadding, sectionY);
  doc.text(paymentStatus, margin + halfWidth + sectionPadding + 88, sectionY);

  sectionY += 14;
  doc.text("Confirmed At:", margin + sectionPadding, sectionY);
  doc.text(paymentConfirmedAt, margin + sectionPadding + 110, sectionY);

  y += sectionHeight + sectionGap;

  doc.setFillColor(255, 255, 255);
  doc.rect(margin, y, width, 120, "F");
  doc.setDrawColor("#E2D5C0");
  doc.rect(margin, y, width, 120, "S");

  sectionY = y + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#1A0F00");
  doc.text("Passenger Information", margin + sectionPadding, sectionY);

  sectionY += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#333333");
  doc.text(`Name: ${studentName}`, margin + sectionPadding, sectionY);
  doc.text(`Type: ${bookingType}`, margin + halfWidth + sectionPadding, sectionY);

  sectionY += 14;
  doc.text(`Student ID: ${studentId}`, margin + sectionPadding, sectionY);
  doc.text(`Phone: ${phone}`, margin + halfWidth + sectionPadding, sectionY);

  sectionY += 14;
  doc.text(`Destination: ${destination}`, margin + sectionPadding, sectionY);
  doc.text(`Travel Date: ${travelDate}`, margin + halfWidth + sectionPadding, sectionY);

  sectionY += 14;
  doc.text(`Pickup Location: ${pickup}`, margin + sectionPadding, sectionY);
  doc.text(`Seats: ${seats}`, margin + halfWidth + sectionPadding, sectionY);

  y += 120 + sectionGap;

  doc.setFillColor(248, 247, 245);
  doc.rect(margin, y, width, 70, "F");
  doc.setDrawColor("#E2D5C0");
  doc.rect(margin, y, width, 70, "S");

  sectionY = y + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#1A0F00");
  doc.text("Payment Summary", margin + sectionPadding, sectionY);

  sectionY += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#333333");
  doc.text(`Payment Status: ${paymentStatus}`, margin + sectionPadding, sectionY);
  doc.text(`Confirmed At: ${paymentConfirmedAt}`, margin + halfWidth + sectionPadding, sectionY);

  y += 70 + sectionGap;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#666666");
  doc.text("This receipt is proof of payment and should be kept for your records.", margin, y);
  y += 14;
  doc.text("For support, contact Travel with Hawkins at +265 989 127 308 or hgkalambo@gmail.com.", margin, y);

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
