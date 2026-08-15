# Route-model decision (Marketplace Expansion, Stage 0)

Stage 0's exit gate calls for the legacy-vs-structured route question to be resolved and written down before Stage 1 schema work starts. This is that record.

## What's actually there today

These are not two competing implementations of the same thing — they're two directional flows that happen to use different storage:

1. **`settings.route_objects` / `settings.routes`** (free text, parsed by `lib/routePricing.ts`'s fuzzy matcher) — models **outbound** trips: origin "Mzuzu" → a home district. Powers the homepage's "Popular routes" pills and the custom-destination path in `BookingModal.tsx`. No referential integrity, no status field, no way to attach an operator.
2. **The structured `routes` table** (`db/migrations/2026_08_04_universities_and_structured_routes.sql`, made fully directional in `2026_08_08_directional_routes.sql`) — models **both directions** of district ↔ university: `to_university` and `from_university` legs, each its own row with its own fare, capacity, commission, and status. Powers `TripSearchCard`, `/trips`, and `/book`. Admin-editable, status-gated, real foreign keys.

The structured table already absorbed the direction problem. The one real gap is that it's still anchored on `university_id NOT NULL` — every row has to terminate at a university. `settings.route_objects` remains the only thing modeling a plain city pill ("Mzuzu → Lilongwe") with no campus involved.

## Why this matters for Marketplace Expansion

The Master Plan's Wave 1 corridors are **general public intercity routes** — Mzuzu–Lilongwe, Lilongwe–Blantyre — not university-anchored. Multi-operator search (Stage 3) also needs every route to carry a verified operator identity, which a fuzzy-matched text blob structurally cannot do: there's nowhere to attach `operator_id`, no status to gate a route on operator readiness, no way to show a verification badge next to it.

## Decision

**The structured `routes` table becomes the one route model.** `settings.route_objects` / `lib/routePricing.ts` get retired as a source of truth once their current live data is migrated into `routes` rows — not merged in the sense of picking a direction, but in the sense of ending the free-text-vs-structured split. Concretely, Stage 1's schema migration:

- Makes `routes.university_id` nullable and adds a nullable `destination_label` column, with a check constraint requiring one or the other — so a route can terminate at a university *or* at a plain city/terminal name, without forcing every future public-intercity route through university machinery it doesn't need.
- Adds `operator_id` to `routes` (nullable for now, backfilled to an internal "Travel With Hawkins" operator record so every existing row keeps working unchanged).

**What Stage 1 does not do:** touch `lib/routePricing.ts`, the homepage pills, or the booking API. Those stay exactly as they are until Stage 3, when the multi-operator search rework actually migrates the "Popular routes" UX onto the generalized `routes` table and `lib/routePricing.ts` is deleted. Stage 1 is schema-only, additive, and changes nothing customer-facing — consistent with its own exit gate.
