"use client";

import { useState } from "react";
import { logoPngBase64 } from "@/lib/logoBase64";
import { formatMwk } from "@/lib/routePricing";

type PremiumBoardingPassProps = {
  name: string;
  studentId: string;
  phone: string;
  destination: string;
  travelDate: string;
  seats: number;
  bookingId: string;
  bookingType: string;
  fare?: number;
};

export default function PremiumBoardingPass(props: PremiumBoardingPassProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.bookingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const handleDownloadPdf = async () => {
    try {
      const imported = await import("jspdf");
      const Ctor = imported.default || imported.jsPDF;
      const doc = new Ctor({ orientation: "portrait", unit: "pt", format: "a5", compress: true });
      const margin = 24;
      const width = 420 - margin * 2;
      let y = 24;
      const logoBase64 = logoPngBase64 || null;

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, width, 112, 8, 8, "F");
      doc.setDrawColor("#E5E7EB");
      doc.roundedRect(margin, y, width, 112, 8, 8, "S");

      doc.setTextColor("#1A0F00");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Travel with Hawkins", margin + 12, y + 24);

      if (logoBase64) {
        doc.addImage(`data:image/png;base64,${logoBase64}`, "PNG", margin + width - 48, y + 10, 36, 36);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor("#6B7280");
      doc.text("Student Transport Boarding Pass", margin + 12, y + 44);

      y += 124;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, width, 134, 8, 8, "F");
      doc.setDrawColor("#E5E7EB");
      doc.roundedRect(margin, y, width, 134, 8, 8, "S");

      const boxPadding = 14;
      const leftX = margin + boxPadding;
      const rightX = margin + width / 2 + 6;
      let boxY = y + 16;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor("#111827");
      doc.text("Passenger Details", leftX, boxY);

      boxY += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor("#374151");
      doc.text(`Passenger: ${props.name}`, leftX, boxY);
      doc.text(`Student ID: ${props.studentId || "N/A"}`, leftX, boxY + 14);
      doc.text(`Phone: ${props.phone}`, leftX, boxY + 28);

      doc.setFont("helvetica", "bold");
      doc.text("Trip Details", rightX, y + 16);
      doc.setFont("helvetica", "normal");
      doc.text(`Destination: ${props.destination}`, rightX, y + 28);
      doc.text(`Travel Date: ${props.travelDate}`, rightX, y + 42);
      doc.text(`Seats: ${props.seats}`, rightX, y + 56);
      doc.text(`Fare: ${formatMwk(props.fare)}`, rightX, y + 70);
      doc.text(`Booking Type: ${props.bookingType}`, rightX, y + 84);

      y += 276;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, width, 48, 8, 8, "F");
      doc.setDrawColor("#E5E7EB");
      doc.roundedRect(margin, y, width, 48, 8, 8, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor("#111827");
      doc.text("Booking ID", margin + boxPadding, y + 16);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor("#0D2655");
      doc.text(props.bookingId, margin + boxPadding, y + 32);

      doc.save(`TWH-Boarding-Pass-${props.bookingId}.pdf`);
    } catch {
      window.print();
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-dashed border-slate-300 bg-slate-50 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Booking reference</p>
            <p className="mt-1 break-all font-mono text-base font-black tracking-wide text-navy">{props.bookingId}</p>
          </div>
          <span className="shrink-0 rounded-full border border-orange/25 bg-orange-soft px-3 py-1 text-[10px] font-black uppercase tracking-wide text-orange">
            {props.bookingType === "route" ? "Scheduled route" : "Custom trip"}
          </span>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
        {[
          ["Passenger", props.name],
          ["Student ID", props.studentId || "N/A"],
          ["Phone", props.phone],
          ["Seats reserved", `${props.seats} seat${props.seats === 1 ? "" : "s"}`],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-900">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200">
        <button onClick={handleCopy} className="px-3 py-3.5 text-sm font-bold text-navy transition hover:bg-orange-soft">
          {copied ? "Reference copied" : "Copy reference"}
        </button>
        <button onClick={handleDownloadPdf} className="px-3 py-3.5 text-sm font-bold text-navy transition hover:bg-orange-soft">
          Download PDF
        </button>
      </div>
    </div>
  );
}
