# University launch readiness — 8 August 2026

## Verified application state

- The Next.js 16.2.9 production build completes successfully.
- TypeScript passes with no errors.
- The automated suite passes: 79 tests, 0 failures.
- Targeted ESLint checks have 0 errors. The ambassador wizard retains one existing `no-img-element` optimization warning.
- Super admins and global admins retain global access.
- University-admin booking reads and mutations are scoped by active rows in `university_admin_assignments`.
- Public trip search and booking only expose active universities.
- Ambassador recruitment can target active or inactive universities for pre-launch staffing.

## Verified live Supabase state

Read-only checks against the configured Supabase project confirmed:

| Resource | Current count |
| --- | ---: |
| Universities | 6 |
| University-admin assignments | 0 |
| Campus pickup points | 7 |
| District pickup points | 6 |
| Structured routes | 14 |
| Ambassadors | 9 |
| Bookings | 38 |

All required multi-university tables and inspected columns are present.

### University route coverage

| University | Status | Routes | Active routes |
| --- | --- | ---: | ---: |
| Mzuzu University (MZUNI) | Active | 10 | 10 |
| University of Malawi (UNIMA) | Inactive | 0 | 0 |
| Malawi University of Business and Applied Sciences (MUBAS) | Inactive | 0 | 0 |
| Malawi University of Science and Technology (MUST) | Inactive | 0 | 0 |
| Lilongwe University of Agriculture and Natural Resources (LUANAR) | Inactive | 4 | 0 |
| Kamuzu University of Health Sciences (KUHeS) | Inactive | 0 | 0 |

The 14 routes are balanced across direction: 7 `to_university` and 7 `from_university`. No route is missing its required district pickup point.

## Launch blockers and required operational work

1. Assign at least one real account the `university_admin` role and one or more universities through `/admin/users`. There are currently no university-admin assignment rows.
2. Configure both journey directions, fares, district pickup points, and campus pickup points before activating each additional university.
3. Run an authenticated acceptance test with a university-admin account to prove it can see and mutate its university's bookings and cannot access another university's bookings.
4. Keep universities inactive until their route and pickup-point configuration is complete. Inactive universities remain available for ambassador recruitment but cannot be booked.

## Legacy booking note

All 38 current bookings have a university ID, but they predate structured routes and therefore have no `route_id` or district pickup-point ID. This does not block new bookings. Historical pickup details should continue to be read from their legacy booking fields; they cannot be safely attached to a structured route automatically without an operational mapping decision.

## Acceptance sequence for each university

1. Create or verify the university record and keep it inactive.
2. Add campus and district pickup points.
3. Configure active routes for both `to_university` and `from_university`, including fares.
4. Recruit or assign ambassadors.
5. Assign the university administrator through super-admin user management.
6. Test university-admin booking visibility, status changes, rescheduling, cash confirmation (if permitted), reports, and route editing.
7. Test a customer search and booking in each direction.
8. Activate the university only after all checks pass.
