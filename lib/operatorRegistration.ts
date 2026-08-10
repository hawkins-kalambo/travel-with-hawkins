import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OperatorRegistrationData = {
  legalName: string;
  displayName: string;
  isIndividual: boolean;
  ownerFullName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
  ownerConfirmPassword: string;
};

export type OperatorRegistrationResult =
  | { success: true; userId: string; operatorId: string }
  | { success: false; error: string };

// Registers a new operator organization and its owner account together.
// Unlike customer registration, there is no OTP email-verification step —
// Supabase's own confirmation email (email_confirm: false) is sufficient
// here because operators additionally go through a substantive admin
// review of documents before their service ever goes live (Master Plan
// §4.2); email OTP exists for customers mainly to gate self-service booking
// immediately, which doesn't apply to an operator application.
export async function registerOperator(data: OperatorRegistrationData): Promise<OperatorRegistrationResult> {
  const legalName = data.legalName.trim();
  const displayName = data.displayName.trim();
  const ownerFullName = data.ownerFullName.trim();
  const ownerEmail = data.ownerEmail.trim().toLowerCase();
  const ownerPhone = data.ownerPhone.trim();

  if (!legalName || !displayName || !ownerFullName || !ownerEmail || !ownerPhone) {
    return { success: false, error: "All fields are required" };
  }

  if (data.ownerPassword !== data.ownerConfirmPassword) {
    return { success: false, error: "Passwords do not match" };
  }

  if (data.ownerPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters long" };
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: ownerEmail,
    password: data.ownerPassword,
    email_confirm: false,
    user_metadata: {
      full_name: ownerFullName,
      phone: ownerPhone,
      role: "operator_staff",
    },
  });

  if (authError) {
    return { success: false, error: authError.message };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { success: false, error: "Failed to create owner account" };
  }

  // Best-effort cleanup if anything after this point fails, so a partial
  // registration doesn't leave an orphaned, unusable auth user behind.
  const rollbackAuthUser = async () => {
    await supabaseAdmin.auth.admin.deleteUser(userId).catch((cleanupError) => {
      console.error("Failed to roll back auth user after operator registration failure", cleanupError);
    });
  };

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    full_name: ownerFullName,
    email: ownerEmail,
    phone: ownerPhone,
    role: "operator_staff",
  });

  if (profileError) {
    await rollbackAuthUser();
    return { success: false, error: "Failed to create owner profile" };
  }

  const { data: operatorRow, error: operatorError } = await supabaseAdmin
    .from("operators")
    .insert({
      legal_name: legalName,
      display_name: displayName,
      is_individual: data.isIndividual,
      contact_name: ownerFullName,
      contact_email: ownerEmail,
      contact_phone: ownerPhone,
      application_status: "submitted",
      status: "draft",
    })
    .select("id")
    .single();

  if (operatorError || !operatorRow) {
    await rollbackAuthUser();
    return { success: false, error: "Failed to create operator application" };
  }

  const operatorId = operatorRow.id as string;

  const { error: membershipError } = await supabaseAdmin.from("operator_memberships").insert({
    operator_id: operatorId,
    user_id: userId,
    staff_role: "owner",
    status: "active",
    assigned_by: userId,
  });

  if (membershipError) {
    await rollbackAuthUser();
    return { success: false, error: "Failed to link owner to operator" };
  }

  // Wave 1 is intercity-only — an operator applies for that service by
  // default. Taxi/car-hire approvals get added when those channels open.
  const { error: serviceApprovalError } = await supabaseAdmin.from("service_approvals").insert({
    operator_id: operatorId,
    service_type: "intercity",
    status: "pending",
  });

  if (serviceApprovalError) {
    console.error("Failed to create default service approval", serviceApprovalError);
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: userId,
    actor_role: "operator_staff",
    action: "operator_registered",
    entity_type: "operator",
    entity_id: operatorId,
    new_value: { legal_name: legalName, display_name: displayName, application_status: "submitted" },
    operator_id: operatorId,
  });

  return { success: true, userId, operatorId };
}
