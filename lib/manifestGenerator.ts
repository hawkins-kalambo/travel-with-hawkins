import { jsPDF } from "jspdf";

// Fixes the dead "Download PDF" button on the ambassador dashboard
// (app/ambassador/(protected)/dashboard/page.tsx) — previously had no
// onClick handler at all. Mirrors the layout conventions already
// established in lib/receiptGenerator.ts.

export type ManifestRow = {
  customerName?: string | null;
  customerPhone?: string | null;
  route?: string | null;
  travelDate?: string | null;
  commissionStatus?: string | null;
};

function safeText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

function buildManifestDocument(ambassadorName: string, referralCode: string, rows: ManifestRow[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = pageWidth - margin * 2;
  let y = 48;

  doc.setTextColor("#0f3f78");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Travel with Hawkins", margin, y);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#4B5563");
  doc.text(`Ambassador passenger manifest — ${safeText(ambassadorName)} (${safeText(referralCode)})`, margin, y);

  y += 12;
  doc.text(`Generated: ${new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date())}`, margin, y);

  y += 18;
  doc.setDrawColor("#E5E7EB");
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + width, y);
  y += 20;

  const columns = [
    { label: "Customer", widthRatio: 0.28 },
    { label: "Phone", widthRatio: 0.18 },
    { label: "Route", widthRatio: 0.28 },
    { label: "Travel date", widthRatio: 0.14 },
    { label: "Status", widthRatio: 0.12 },
  ];

  const drawHeaderRow = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor("#111827");
    let x = margin;
    for (const column of columns) {
      const colWidth = width * column.widthRatio;
      doc.text(column.label, x, y);
      x += colWidth;
    }
    y += 8;
    doc.setDrawColor("#E5E7EB");
    doc.line(margin, y, margin + width, y);
    y += 14;
  };

  drawHeaderRow();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor("#374151");

  const pageBottom = doc.internal.pageSize.getHeight() - margin;

  if (rows.length === 0) {
    doc.text("No referred passengers yet.", margin, y);
  }

  for (const row of rows) {
    if (y > pageBottom) {
      doc.addPage();
      y = margin;
      drawHeaderRow();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor("#374151");
    }

    let x = margin;
    const values = [
      safeText(row.customerName),
      safeText(row.customerPhone),
      safeText(row.route),
      safeText(row.travelDate),
      safeText(row.commissionStatus),
    ];
    values.forEach((value, index) => {
      const colWidth = width * columns[index].widthRatio;
      const lines = doc.splitTextToSize(value, colWidth - 6);
      doc.text(lines, x, y);
      x += colWidth;
    });
    y += 16;
  }

  return doc;
}

export function generateManifestPdfBlob(ambassadorName: string, referralCode: string, rows: ManifestRow[]): Blob {
  return buildManifestDocument(ambassadorName, referralCode, rows).output("blob");
}
