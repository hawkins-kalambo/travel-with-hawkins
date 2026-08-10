import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { getOperatorRolePermissions } from "@/lib/operatorPermissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response);
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data: operator, error: operatorError } = await supabaseAdmin
    .from("operators")
    .select("id, legal_name, display_name, is_individual, application_status, status, paychangu_connect_status, created_at")
    .eq("id", auth.operatorId)
    .maybeSingle();

  if (operatorError || !operator) {
    return jsonError("Unable to load operator", 500);
  }

  const { data: serviceApprovals } = await supabaseAdmin
    .from("service_approvals")
    .select("service_type, status")
    .eq("operator_id", auth.operatorId);

  return NextResponse.json({
    success: true,
    operator: {
      id: operator.id,
      legalName: operator.legal_name,
      displayName: operator.display_name,
      isIndividual: operator.is_individual,
      applicationStatus: operator.application_status,
      status: operator.status,
      paychanguConnectStatus: operator.paychangu_connect_status,
      createdAt: operator.created_at,
    },
    serviceApprovals: serviceApprovals ?? [],
    staffRole: auth.staffRole,
    permissions: getOperatorRolePermissions(auth.staffRole),
  });
}
