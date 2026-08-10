import "server-only";

import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { OperatorStaffRole } from "@/lib/operatorPermissions";

// Same pattern as ambassador onboarding (app/api/applications/review/route.ts):
// a random temp password returned directly in the API response, not emailed.
// Operator registration already learned this lesson the hard way (see
// lib/operatorRegistration.ts) — never gate account usability on an email
// actually arriving. The owner relays this password to the new staff member
// however they like (WhatsApp, in person, etc).
function generateTemporaryPassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  const random = randomBytes(12);
  const password = Array.from(random).map((byte) => chars[byte % chars.length]).join("");
  return `TWHOp@${password.slice(0, 8)}`;
}

export type InviteStaffInput = {
  operatorId: string;
  invitedByUserId: string;
  fullName: string;
  email: string;
  phone: string;
  staffRole: OperatorStaffRole;
};

export type InviteStaffResult =
  | { success: true; userId: string; temporaryPassword: string }
  | { success: false; error: string };

export async function inviteOperatorStaff(input: InviteStaffInput): Promise<InviteStaffResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!fullName || !email || !phone) {
    return { success: false, error: "Full name, email, and phone are required" };
  }

  const { data: existingProfile } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existingProfile) {
    return {
      success: false,
      error: "An account with this email already exists. They can't be invited as new staff — contact support if this should be resolved.",
    };
  }

  const temporaryPassword = generateTemporaryPassword();

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, role: "operator_staff" },
  });

  if (authError || !authData?.user?.id) {
    return { success: false, error: authError?.message || "Failed to create staff account" };
  }

  const userId = authData.user.id;

  const rollbackAuthUser = async () => {
    await supabaseAdmin.auth.admin.deleteUser(userId).catch((cleanupError) => {
      console.error("Failed to roll back auth user after staff invite failure", cleanupError);
    });
  };

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    full_name: fullName,
    email,
    phone,
    role: "operator_staff",
  });

  if (profileError) {
    await rollbackAuthUser();
    return { success: false, error: "Failed to create staff profile" };
  }

  const { error: membershipError } = await supabaseAdmin.from("operator_memberships").insert({
    operator_id: input.operatorId,
    user_id: userId,
    staff_role: input.staffRole,
    status: "active",
    assigned_by: input.invitedByUserId,
  });

  if (membershipError) {
    await rollbackAuthUser();
    return { success: false, error: "Failed to add staff member to operator" };
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: input.invitedByUserId,
    actor_role: "operator_staff",
    action: "invite_operator_staff",
    entity_type: "operator_membership",
    entity_id: userId,
    operator_id: input.operatorId,
    new_value: { staff_role: input.staffRole, email },
  });

  return { success: true, userId, temporaryPassword };
}

// An operator with zero active owners is unrecoverable through normal
// self-service (only owners can manage staff) — admin intervention would be
// the only way back in. Cheap to check before any status/role change that
// could produce that state.
export async function countActiveOwners(operatorId: string, excludingUserId?: string): Promise<number> {
  let query = supabaseAdmin
    .from("operator_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("operator_id", operatorId)
    .eq("staff_role", "owner")
    .eq("status", "active");

  if (excludingUserId) query = query.neq("user_id", excludingUserId);

  const { count, error } = await query;
  if (error) {
    console.error("Failed to count active owners", error);
    return 0;
  }
  return count ?? 0;
}
