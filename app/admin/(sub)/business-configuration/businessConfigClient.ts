import { supabase } from "@/lib/auth";

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  } catch {
    return fetch(input, { ...init, credentials: "same-origin" });
  }
}

export async function loadBusinessSettings() {
  const res = await fetch("/api/settings", { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`Unable to load settings (${res.status})`);
  }
  const data = (await res.json()) as { settings?: Record<string, unknown> };
  return data.settings || {};
}

export async function saveBusinessSettings(payload: Record<string, unknown>) {
  const res = await authFetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { success?: boolean; settings?: Record<string, unknown>; error?: string };
  if (!res.ok || data.success !== true) {
    throw new Error(data.error || `Unable to save settings (${res.status})`);
  }

  return data.settings || {};
}
