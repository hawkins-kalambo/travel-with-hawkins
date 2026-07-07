import { jsPDF } from "jspdf";
import type { BookingRecord } from "@/lib/bookingTypes";
import { logoPngBase64 } from "@/lib/logoBase64";

function formatDateDisplay(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function shortText(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function addPageHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  rowsCount: number,
  metadata: Record<string, string | undefined>
) {
  const margin = 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#1A0F00");
  doc.text("Travel with Hawkins", margin, 42);

  if (logoPngBase64) {
    doc.addImage(`data:image/png;base64,${logoPngBase64}`, "PNG", 520, 16, 60, 60);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor("#444444");
  doc.text(subtitle, margin, 62);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, margin, 80);

  const metaX = 520;
  let metaY = 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`Generated: ${formatDateDisplay(new Date().toISOString())}`, metaX, metaY);
  metaY += 12;
  doc.text(`Rows: ${rowsCount}`, metaX, metaY);
  metaY += 14;

  doc.setFont("helvetica", "normal");
  Object.entries(metadata).forEach(([key, value]) => {
    if (!value) return;
    const line = `${key}: ${value}`;
    doc.text(line, margin, metaY);
    metaY += 10;
  });

  doc.setDrawColor("#E8650A");
  doc.setLineWidth(1);
  doc.line(margin, 94, 820, 94);
}

export function generatePassengerManifestPdfBlob(
  reportTitle: string,
  metadata: Record<string, string | undefined>,
  rows: BookingRecord[]
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 28;
  const maxWidth = 842 - margin * 2;
  const pageHeight = 595;
  const headerHeight = 104;
  const rowHeight = 12;
  const bottomMargin = 32;

  const columns = [
    { label: "Booking ID", width: 70 },
    { label: "Trip ID", width: 70 },
    { label: "Student", width: 90 },
    { label: "Student ID", width: 55 },
    { label: "Phone", width: 80 },
    { label: "Destination", width: 115 },
    { label: "Pickup", width: 80 },
    { label: "Date", width: 55 },
    { label: "Seats", width: 30 },
    { label: "Journey Status", width: 70 },
    { label: "Payment Status", width: 70 },
  ];

  let y = headerHeight + 20;

  const addTableHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = margin;
    for (const col of columns) {
      doc.text(col.label, x + 1, y);
      x += col.width;
    }
    y += rowHeight;
    doc.setDrawColor("#DDDDDD");
    doc.setLineWidth(0.5);
    doc.line(margin, y - 6, margin + maxWidth, y - 6);
  };

  const addFooter = (pageNumber: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#666666");
    doc.text(`Prepared by Travel with Hawkins`, margin, pageHeight - 16);
    doc.text(`Page ${pageNumber}`, 842 - margin - 40, pageHeight - 16);
  };

  let pageNumber = 1;
  addPageHeader(doc, reportTitle, "Passenger Manifest & Report", rows.length, metadata);
  addTableHeader();

  const printRow = (row: BookingRecord) => {
    if (y + rowHeight > pageHeight - bottomMargin) {
      addFooter(pageNumber);
      doc.addPage();
      pageNumber += 1;
      y = headerHeight + 20;
      addPageHeader(doc, reportTitle, "Passenger Manifest & Report", rows.length, metadata);
      addTableHeader();
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor("#1A0F00");

    let x = margin;
    const cells = [
      shortText(String(row.bookingId ?? "—"), 12),
      shortText(String(row.tripId ?? "—"), 12),
      shortText(String(row.name ?? "—"), 16),
      shortText(String(row.studentId ?? "—"), 10),
      shortText(String(row.phone ?? "—"), 11),
      shortText(String(row.destination ?? "—"), 16),
      shortText(String(row.pickup ?? "—"), 10),
      shortText(formatDateDisplay(String(row.travelDate ?? "")), 8),
      String(row.seats ?? 1),
      shortText(String(row.status ?? "—"), 10),
      shortText(String(row.paymentStatus ?? "—"), 10),
    ];

    for (let index = 0; index < cells.length; index += 1) {
      doc.text(cells[index], x + 1, y);
      x += columns[index].width;
    }

    y += rowHeight;
  };

  for (const row of rows) {
    printRow(row);
  }

  addFooter(pageNumber);
  return doc.output("blob");
}
