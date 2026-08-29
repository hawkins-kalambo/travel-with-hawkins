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
    in() { return chain; }, ilike() { return chain; }, is() { return chain; }, not() { return chain; },
    upsert() { return chain; },
    limit() { return chain; }, order() { return chain; },
    maybeSingle() { return Promise.resolve(tableData(table)); },
    then(resolve: (v: Rows) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(tableData(table)).then(resolve, reject);
    },
  };
  return chain;
}

let rpcResult: Rows = { data: null, error: null };
mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: (t: string) => builder(t), rpc: async () => rpcResult } },
});
mock.module("@/lib/bookingAccess", { exports: { contactMatchesBooking: () => false, loadBookingById: async () => ({ found: false }) } });
mock.module("@/lib/bookingServerUtils", { exports: { generateBookingId: () => "BK-1", generateTripId: () => "TRIP-1" } });
mock.module("@/lib/payments/payment-service", { exports: { initiatePayChanguPayment: async () => ({ outcome: "rejected", reason: "test" }) } });
mock.module("@/lib/payments/finalize-flow", { exports: { verifyAndFinalizePayment: async () => ({ outcome: "failed" }) } });

const {
  findAvailableDepartures, loadDeparture, listBookableRoutes, loadBookableRoute,
  createUnassignedWhatsAppBooking, listPopularRoutes, findGeneralRoute, matchActiveUniversity,
} = await import("./domain.ts");

const activeRoute = {
  id: "r1", origin_district: "Lilongwe", university_id: "u1", fare: 12000,
  status: "active", direction: "to_university",
  university: { name: "Mzuzu University", short_code: "MZUNI", status: "active" },
  pickupPoint: { label: "Main Campus", status: "active" },
  districtPickupPoint: { label: "Lilongwe Bus Depot", status: "active" },
};

beforeEach(() => {
  for (const k of Object.keys(selects)) delete selects[k];
  routesRows = { data: [activeRoute], error: null };
  departuresRows = { data: [], error: null };
  bookingsRows = { data: [], error: null };
  rpcResult = { data: null, error: null };
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

// --- Booking before a trip is created (Stage 2.1) ---

test("listBookableRoutes shapes a route and flags it priced, without needing a departure", async () => {
  const [route] = await listBookableRoutes("Lilongwe");
  assert.equal(route.label, "Lilongwe - Mzuzu University");
  assert.equal(route.fare, 12000);
  assert.equal(route.priced, true);
  assert.doesNotMatch(selects.routes.join(" "), /destination_label/);
});

test("listBookableRoutes still lists an unpriced route but marks priced=false", async () => {
  routesRows = { data: [{ ...activeRoute, fare: 0 }], error: null };
  const [route] = await listBookableRoutes("Lilongwe");
  assert.equal(route.priced, false);
});

test("listBookableRoutes drops routes whose destination university is inactive", async () => {
  routesRows = { data: [{ ...activeRoute, university: { name: "Mzuzu University", status: "suspended" } }], error: null };
  assert.deepEqual(await listBookableRoutes("Lilongwe"), []);
});

test("loadBookableRoute returns null when the route row is missing", async () => {
  routesRows = { data: null, error: null };
  assert.equal(await loadBookableRoute("nope"), null);
});

test("createUnassignedWhatsAppBooking refuses an unpriced route before calling the RPC", async () => {
  routesRows = { data: { ...activeRoute, fare: 0 }, error: null };
  const result = await createUnassignedWhatsAppBooking(
    { conversationId: "c1", contactId: "ct1", waId: "+265991234567" } as never,
    { routeId: "r1", travelDate: "2026-12-20", name: "Jane Banda" },
    "op-1",
  );
  assert.deepEqual(result, { outcome: "rejected", reason: "route_unpriced" });
});

test("createUnassignedWhatsAppBooking returns the created booking from the RPC row", async () => {
  routesRows = { data: activeRoute, error: null };
  rpcResult = {
    data: [{ outcome: "created", booking_id: "BK-1", reason: null, expires_at: "2026-12-13T21:59:59Z", fare: 12000, booking_fee: 5000 }],
    error: null,
  };
  const result = await createUnassignedWhatsAppBooking(
    { conversationId: "c1", contactId: "ct1", waId: "+265991234567" } as never,
    { routeId: "r1", travelDate: "2026-12-20", name: "Jane Banda" },
    "op-1",
  );
  assert.equal(result.outcome, "created");
  assert.equal(result.bookingId, "BK-1");
  assert.equal(result.fare, 12000);
  assert.equal(result.bookingFee, 5000);
});

// --- Structured route discovery (student vs general travel flow) ---

const generalRouteRow = {
  id: "gr-1", origin_district: "Lilongwe", university_id: null,
  destination_district: "Blantyre", route_type: "general", is_popular: true, popular_order: 1,
  fare: 18000, status: "active", direction: "general",
  university: null, pickupPoint: null,
  districtPickupPoint: { label: "Lilongwe Bus Depot", status: "active" },
};

test("listPopularRoutes shapes a district-to-district general route with no university", async () => {
  routesRows = { data: [generalRouteRow], error: null };
  const [route] = await listPopularRoutes();
  assert.equal(route.label, "Lilongwe - Blantyre");
  assert.equal(route.destination, "Blantyre");
  assert.equal(route.routeType, "general");
  assert.equal(route.isPopular, true);
  assert.equal(route.priced, true);
  assert.equal(route.pickup, "Lilongwe Bus Depot");
});

test("findGeneralRoute re-orients a stored leg to the requested origin -> destination", async () => {
  routesRows = { data: [generalRouteRow], error: null };
  const reversed = await findGeneralRoute("Blantyre", "Lilongwe");
  assert.ok(reversed);
  assert.equal(reversed!.label, "Blantyre - Lilongwe");
  assert.equal(reversed!.origin, "Blantyre");
  assert.equal(reversed!.destination, "Lilongwe");
});

test("findGeneralRoute returns null when no leg matches the corridor", async () => {
  routesRows = { data: [generalRouteRow], error: null };
  assert.equal(await findGeneralRoute("Mzuzu", "Zomba"), null);
});

// --- University abbreviations (spec §5) ---

test("a student route exposes the university short code and a compact menu label", async () => {
  const [route] = await listBookableRoutes("Lilongwe");
  assert.equal(route.label, "Lilongwe - Mzuzu University");     // full name — stored on the booking
  assert.equal(route.menuLabel, "Lilongwe - MZUNI");            // short code — WhatsApp list row
  assert.equal(route.universityShortCode, "MZUNI");
  assert.equal(route.universityName, "Mzuzu University");
  assert.equal(route.universityId, "u1");
});

test("matchActiveUniversity resolves the short code and the full name to the same record", () => {
  const unis = [
    { id: "u-mzuni", name: "Mzuzu University", shortCode: "MZUNI" },
    { id: "u-luanar", name: "Lilongwe University of Agriculture and Natural Resources", shortCode: "LUANAR" },
    { id: "u-kuhes", name: "Kamuzu University of Health Sciences", shortCode: "KUHeS" },
  ];
  assert.equal(matchActiveUniversity("mzuni", unis)?.id, "u-mzuni");
  assert.equal(matchActiveUniversity("  MZUNI ", unis)?.id, "u-mzuni");
  assert.equal(matchActiveUniversity("Mzuzu University", unis)?.id, "u-mzuni");
  assert.equal(matchActiveUniversity("mzuzu   university", unis)?.id, "u-mzuni");
  // LUANAR and KUHeS stay distinct — never collapsed into one option
  assert.equal(matchActiveUniversity("LUANAR", unis)?.id, "u-luanar");
  assert.equal(matchActiveUniversity("KUHeS", unis)?.id, "u-kuhes");
  assert.equal(matchActiveUniversity("Cambridge", unis), null);
});
