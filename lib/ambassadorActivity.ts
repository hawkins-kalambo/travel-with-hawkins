import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function logAmbassadorActivity({
  ambassadorId,
  profileId,
  activityType,
  description,
}: {
  ambassadorId?: string | null;
  profileId?: string | null;
  activityType: string;
  description?: string | null;
}) {
  let resolvedAmbassadorId = ambassadorId ?? null;

  if (!resolvedAmbassadorId && profileId) {
    const { data, error } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (!error) {
      resolvedAmbassadorId = data?.id ?? null;
    }
  }

  if (!resolvedAmbassadorId) return null;

  const { data, error } = await supabaseAdmin
    .from("ambassador_activity_logs")
    .insert([
      {
        ambassador_id: resolvedAmbassadorId,
        activity_type: activityType,
        description: description ?? null,
      },
    ])
    .select("id")
    .single();

  if (error) {
    console.warn("Failed to write ambassador activity log", error);
    return null;
  }

  return data;
}
