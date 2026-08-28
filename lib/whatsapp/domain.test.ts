import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// Regression guard for the "stuck at route_origin" incident: findAvailableDepartures
// was selecting routes.destination_label, a column that exists in no migration, so
// PostgREST rejected the whole request and the handler threw on every district.

type Rows = { data: unknown; error: unknown };
const selects: Record<string, string[]> = {};
let routesRows: Rows;
let departuresRows: Rows;
let bookingsRows: Rows;

function tableData(table: string): Rows {
  if (table === "routes") return routesRows;
  if (table === "route_departures") return departuresRows;
  if (table === "bookings") return bookingsRows;
  return { data: [], error: null };
}

function builder(table: string) {
  const chain: Record<string, unknown> = {
    select(sql: string) { (selects[table] ??= []).push(sql); return chain; },
    eq() { return chain; }, gt() { return chain; }, gte() { return chain; },
    in() { return chain; }, ilike() { return chain; }, limit() { return chain; }, order() { return chain; },
    then(resolve: (v: Rows) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(tableData(table)).then(resolve, reject);
    },
  };
  return chain;
}

mock.module("@/lib/supabaseAdmin", { exports: { supabaseAdmin: { from: (t: string) => builder(t) } } });
mock.module("@/lib/bookingAccess", { exports: { contactMatchesBooking: () => false, loadBookingById: async () => ({ found: false }) } });
mock.module("@/lib/bookingServerUtils", { exports: { generateBookingId: () => "BK-1", generateTripId: () => "TRIP-1" } });
mock.module("@/lib/payments/payment-service", { exports: { initiatePayChanguPayment: async () => ({ outcome: "rejected", reason: "test" }) } });
mock.module("@/lib/payments/finalize-flow", { exports: { verifyAndFinalizePayment: async () => ({ outcome: "failed" }) } });

const { findAvailableDepartures, loadDeparture } = await import("./domain.ts");

const activeRoute = {
  id: "r1", origin_district: "Lilongwe", university_id: "u1", fare: 12000,
  status: "active", direction: "to_university",
  university: { name: "Mzuzu University", status: "active" },
  pickupPoint: { label: "Main Campus", status: "active" },
  districtPickupPoint: { label: "Lilongwe Bus Depot", status: "active" },
};

beforeEach(() => {
  for (const k of Object.keys(selects)) delete selects[k];
  routesRows = { data: [activeRoute], error: null };
  departuresRows = { data: [], error: null };
  bookingsRows = { data: [], error: null };
});

test("the routes query does not select the non-existent destination_label column", async () => {
  await findAvailableDepartures("Lilongwe");
  const sql = selects.routes.join(" ");
  assert.doesNotMatch(sql, /destination_label/, "destination_label must not be selected");
  assert.match(sql, /university:universities\(name/, "destination comes from the linked university");
});

test("findAvailableDepartures resolves (no throw) when there are no published departures", async () => {
  const result = await findAvailableDepartures("Lilongwe");
  assert.deepEqual(result, []);
});

test("findAvailableDepartures shapes a departure, deriving destination from the university name", async () => {
  departuresRows = {
    data: [{ id: "dep-1", route_id: "r1", capacity: 30, travel_date: "2026-09-01", departure_time: "07:00:00", status: "published" }],
    error: null,
  };
  const [dep] = await findAvailableDepartures("Lilongwe");
  assert.equal(dep.routeLabel, "Lilongwe - Mzuzu University");
  assert.equal(dep.fare, 12000);
  assert.equal(dep.availableSeats, 30);
});

test("a genuine routes query error still propagates (caller guards it)", async () => {
  routesRows = { data: null, error: { code: "42703", message: "column routes.x does not exist" } };
  await assert.rejects(() => findAvailableDepartures("Lilongwe"));
});

test("loadDeparture returns null when the id is not among available departures", async () => {
  assert.equal(await loadDeparture("missing"), null);
});
