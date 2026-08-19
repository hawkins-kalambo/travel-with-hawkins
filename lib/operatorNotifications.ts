import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/resend";
import { logError } from "@/lib/logger";

type OperatorContact = { display_name: string; contact_email: string | null };

async function loadOperatorContact(operatorId: string): Promise<OperatorContact | null> {
  const { data, error } = await supabaseAdmin.from("operators").select("display_name, contact_email").eq("id", operatorId).maybeSingle();
  if (error || !data) return null;
  return data;
}

// Best-effort only — a failed notification must never block the admin
// action that triggered it (pausing an operator, filing an incident), so
// every call site awaits this but ignores its return value.
export async function notifyOperatorOfStatusChange(operatorId: string, nextStatus: string, reason?: string | null): Promise<void> {
  const operator = await loadOperatorContact(operatorId);
  if (!operator?.contact_email) return;

  try {
    await sendEmail({
      to: operator.contact_email,
      subject: `Your Travel With Hawkins operator account status changed to "${nextStatus}"`,
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color:#1a0f00;">Operator account status update</h2>
          <p>Hello <b>${operator.display_name}</b>,</p>
          <p>Your operator account status was changed to <b>${nextStatus}</b>.</p>
          ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ""}
          <p>If you have questions, please contact Travel With Hawkins support.</p>
        </div>
      `,
    });
  } catch (error) {
    logError("Failed to send operator status-change notification", { operatorId, nextStatus, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function notifyOperatorOfIncident(operatorId: string, incident: { case_number: string; severity: string; title: string }): Promise<void> {
  const operator = await loadOperatorContact(operatorId);
  if (!operator?.contact_email) return;

  try {
    await sendEmail({
      to: operator.contact_email,
      subject: `Incident ${incident.case_number} filed against your operator account (${incident.severity})`,
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color:#1a0f00;">Incident filed</h2>
          <p>Hello <b>${operator.display_name}</b>,</p>
          <p>An incident has been opened involving your operator account.</p>
          <ul>
            <li><b>Case number:</b> ${incident.case_number}</li>
            <li><b>Severity:</b> ${incident.severity}</li>
            <li><b>Title:</b> ${incident.title}</li>
          </ul>
          <p>Travel With Hawkins support will follow up with you directly.</p>
        </div>
      `,
    });
  } catch (error) {
    logError("Failed to send operator incident notification", { operatorId, caseNumber: incident.case_number, error: error instanceof Error ? error.message : String(error) });
  }
}
