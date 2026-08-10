import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Guards against an auth-check regression: if someone removes or weakens
// the requireUniversityOperationsUser() call or the super_admin role gate
// on DELETE, these tests should fail. They mock the auth resolver itself
// (rather than faking Supabase sessions end-to-end) so the test controls
// exactly which auth outcome the route handler sees.

let authResult: unknown;

mock.module("@/lib/universityAdminAuth", {
  exports: {
    requireUniversityOperationsUser: async () => authResult,
  },
});

// The route's top-level `import { supabaseAdmin } from "@/lib/supabaseAdmin"`
// still runs even for requests that get rejected by the auth check before
// ever querying the database, so it needs a loadable stand-in.
mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});

const { DELETE } = await import("./route.ts");

function makeDeleteRequest(body: Record<string, unknown> = { bookingId: "TWH-1" }) {
  return new Request("https://example.com/api/admin/bookings", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof DELETE>[0];
}

test("DELETE returns 401 when the caller is not authenticated", async () => {
  authResult = {
    authorized: false,
    user: null,
    role: "unknown",
    isGlobal: false,
    universityIds: [],
    error: "Authentication required",
    status: 401,
  };

  const res = await DELETE(makeDeleteRequest());
  assert.equal(res.status, 401);
});

test("DELETE returns 403 for an authenticated user without university-operations access", async () => {
  authResult = {
    authorized: false,
    user: null,
    role: "customer",
    isGlobal: false,
    universityIds: [],
    error: "University operations access required",
    status: 403,
  };

  const res = await DELETE(makeDeleteRequest());
  assert.equal(res.status, 403);
});

test("DELETE returns 403 for an authorized admin who is not a super_admin", async () => {
  authResult = {
    authorized: true,
    user: { id: "user-1", email: "admin@example.com" },
    role: "admin",
    isGlobal: true,
    universityIds: [],
  };

  const res = await DELETE(makeDeleteRequest());
  assert.equal(res.status, 403);
  const json = await res.json();
  assert.match(json.error, /super admin/i);
});

test("DELETE returns 403 for an authorized university_admin who is not a super_admin", async () => {
  authResult = {
    authorized: true,
    user: { id: "user-2", email: "uniadmin@example.com" },
    role: "university_admin",
    isGlobal: false,
    universityIds: ["uni-1"],
  };

  const res = await DELETE(makeDeleteRequest());
  assert.equal(res.status, 403);
});
