"use client";

import { jsPDF } from "jspdf";
import { useState } from "react";

type SuccessProps = {
  ambassadorName: string;
  email: string;
  temporaryPassword?: string;
  referralCode: string;
  referralLink: string;
  loginUrl: string;
  onClose: () => void;
  onResendEmail: () => Promise<void>;
  onGenerateNewPassword: () => Promise<string>;
};

export default function AmbassadorCreationSuccess({
  ambassadorName,
  email,
  temporaryPassword,
  referralCode,
  referralLink,
  loginUrl,
  onClose,
  onResendEmail,
  onGenerateNewPassword,
}: SuccessProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied to clipboard.`);
    } catch {
      setMessage(`Unable to copy ${label}. Use manual copy instead.`);
    }
  };

  const downloadPdf = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const titleX = margin;
    let y = 50;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Travel with Hawkins - Ambassador Credentials", titleX, y);

    y += 30;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${ambassadorName}`, margin, y);
    y += 18;
    doc.text(`Email: ${email}`, margin, y);
    y += 18;
    if (temporaryPassword) {
      doc.text(`Temporary Password: ${temporaryPassword}`, margin, y);
      y += 18;
    }
    doc.text(`Referral Code: ${referralCode}`, margin, y);
    y += 18;
    doc.text(`Referral Link: ${referralLink}`, margin, y, { maxWidth: pageWidth - margin * 2 });
    y += 18;
    doc.text(`Login URL: ${loginUrl}`, margin, y, { maxWidth: pageWidth - margin * 2 });
    y += 32;
    doc.setFontSize(10);
    doc.text("Please keep these credentials secure. The temporary password is shown once and should be changed after first login.", margin, y, { maxWidth: pageWidth - margin * 2 });

    doc.save(`ambassador-${ambassadorName.replace(/\s+/g, "-").toLowerCase()}-credentials.pdf`);
  };

  const handleResend = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await onResendEmail();
      setMessage("Welcome email resent successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to resend welcome email.");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateNewPassword = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const newPassword = await onGenerateNewPassword();
      setMessage("New temporary password generated.");
      await navigator.clipboard.writeText(newPassword);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate a new temporary password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0f3f78]">Ambassador created</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Creation success</h2>
          <p className="mt-2 text-sm text-slate-500">The credentials below are available until this screen is closed.</p>
        </div>
        <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Finish
        </button>
      </div>

      {message ? <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-900">{message}</div> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ambassador</p>
          <p className="mt-3 text-xl font-black text-slate-900">{ambassadorName}</p>
          <p className="mt-1 text-sm text-slate-600">{email}</p>
          <div className="mt-6 space-y-3">
            {temporaryPassword ? (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Temporary password</p>
                <p className="mt-1 font-semibold text-slate-900 break-all">{temporaryPassword}</p>
              </div>
            ) : null}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Referral code</p>
              <p className="mt-1 font-semibold text-slate-900">{referralCode}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Referral link</p>
            <p className="mt-1 font-semibold text-slate-900 break-all">{referralLink}</p>
          </div>
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Login URL</p>
            <p className="mt-1 font-semibold text-slate-900 break-all">{loginUrl}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {temporaryPassword ? (
          <button type="button" onClick={() => void copyText(temporaryPassword, "Temporary password")} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Copy Password
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            void copyText(
              `Name: ${ambassadorName}\nEmail: ${email}${temporaryPassword ? `\nPassword: ${temporaryPassword}` : ""}\nReferral Code: ${referralCode}\nReferral Link: ${referralLink}\nLogin URL: ${loginUrl}`,
              "Login details"
            )
          }
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Copy Login Details
        </button>
        <button type="button" onClick={() => void copyText(referralLink, "Referral link")} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Copy Referral Link
        </button>
        <button type="button" onClick={downloadPdf} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Download Credentials (PDF)
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button type="button" onClick={handleResend} disabled={busy} className="rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          Send Welcome Email Again
        </button>
        <button type="button" onClick={async () => { await handleGenerateNewPassword(); }} disabled={busy} className="rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          Generate New Temporary Password
        </button>
        <button type="button" onClick={() => window.print()} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Print
        </button>
      </div>
    </div>
  );
}
