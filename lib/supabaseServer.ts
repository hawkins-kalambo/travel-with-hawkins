import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSuperAdminRole, isViewerRole, normalizeAdminRole } from "@/lib/adminAuth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function normalizeRole(role: unknown): string {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

export function getConfiguredAdminEmails(): string[] {
  const configuredValues = [
    process.env.ADMIN_NOTIFICATION_EMAIL,
    process.env.ADMIN_EMAIL,
    "hgkalambo@gmail.com",
  ];

  return Array.from(
    new Set(
      configuredValues
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
        .map((value) => value.trim().toLowerCase())
    )
  );
}

export function isAdminAccessAllowed(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined, profileRole?: unknown) {
  const normalizedProfileRole = normalizeRole(profileRole);
  const normalizedMetadataRole = normalizeRole(user?.user_metadata?.role);
  if (["admin", "super_admin"].includes(normalizedProfileRole) || ["admin", "super_admin"].includes(normalizedMetadataRole)) {
    return true;
  }

  const allowedAdminEmails = getConfiguredAdminEmails();
  const userEmail = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  const metadataEmail = typeof user?.user_metadata?.email === "string" ? user.user_metadata.email.trim().toLowerCase() : "";
  return Boolean((userEmail && allowedAdminEmails.includes(userEmail)) || (metadataEmail && allowedAdminEmails.includes(metadataEmail)));
}

export async function getAdminRoleFromDatabase(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("admins").select("role").eq("id", userId).maybeSingle();

  if (error) {
    console.warn("Failed to load admin role from admins table", error.message);
    return null;
  }

  return typeof data?.role === "string" ? data.role : null;
}

export async function resolveAdminRole(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): Promise<string> {
  if (!user?.id) {
    return "unknown";
  }

  const dbRole = await getAdminRoleFromDatabase(user.id);
  if (dbRole) {
    return normalizeAdminRole(dbRole);
  }

  const roleFromProfile = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const fallbackRole = typeof roleFromProfile.data?.role === "string" ? roleFromProfile.data.role : null;
  const metadataRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : null;
  const resolved = fallbackRole ?? metadataRole ?? "unknown";

  if (isAdminAccessAllowed(user, resolved)) {
    return "super_admin";
  }

  return normalizeAdminRole(resolved);
}

export function isViewerAuthorizedRoute(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/admin";
  if (normalizedPath === "/admin") return true;
  if (normalizedPath === "/admin/dashboard") return true;
  if (normalizedPath === "/admin/overview") return true;
  if (normalizedPath === "/admin") return true;
  return ["/admin/overview", "/admin/trips", "/admin/bookings", "/admin/dashboard"].includes(normalizedPath);
}

export function canAccessAdminRoute(role: unknown, pathname: string): boolean {
  if (isSuperAdminRole(role)) return true;
  if (isViewerRole(role)) return isViewerAuthorizedRoute(pathname);
  return false;
}

export function createSupabaseServerClient(request: NextRequest, response: NextResponse) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value: "", ...options });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });
}

export async function requireAuthenticatedUser(request: NextRequest, response: NextResponse) {
  const supabase = createSupabaseServerClient(request, response);

  // If the client provided a Bearer token (Authorization header), validate it
  // directly with Supabase's `getUser(jwt)` API. This avoids relying on browser
  // session state being mirrored into the server client.
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const result = await supabase.auth.getUser(token);
        return {
          user: result.data.user,
          error: result.error,
        };
      } catch (err) {
        console.warn("Failed to validate Supabase bearer token", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Prevent middleware from stalling for a long time if Supabase is slow/unreachable.
  const timeoutMs = 2500;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Supabase auth getUser() timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      timeout,
    ]);

    return {
      user: result.data.user,
      error: result.error,
    };
  } catch (err) {
    // Treat failures as unauthenticated so middleware can redirect quickly.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("requireAuthenticatedUser failed (treating as unauthenticated)", { message });
    return {
      user: null,
      error: err instanceof Error ? err : new Error("Unauthenticated"),
    };
  }
}

export async function requireAdminUser(request: NextRequest, response: NextResponse) {
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return { authorized: false, user: null, error: "Authentication required" };
  }

  const role = await resolveAdminRole(user);
  const isAdminRole = isSuperAdminRole(role) || isAdminAccessAllowed(user, role);

  if (!isAdminRole) {
    return { authorized: false, user: null, error: "Admin access required" };
  }

  return { authorized: true, user, role, error: null };
}


