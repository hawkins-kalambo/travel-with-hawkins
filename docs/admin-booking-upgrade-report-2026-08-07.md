# Admin Booking Upgrade — Implementation Report

**Project:** Travel with Hawkins
**Report date:** 7 August 2026
**Primary scope:** Booking administration, journey operations, payments, receipts, reporting, notifications, and auditability

## 1. Executive summary

The booking administration workflow has been upgraded from a large, partially inconsistent dashboard into a safer operational system with a canonical admin API, role-aware access, validated journey transitions, trip-wide operations, split payment visibility, booking details, rescheduling, filtering, pagination, customer notifications, and an auditable change history.

The existing Supabase database was checked after implementation. All required booking columns and supporting tables are present. No new SQL migration is required for this release.

Verification completed successfully:

- TypeScript compilation passes.
- All 70 automated tests pass.
- Targeted ESLint checks pass without warnings.
- `git diff --check` passes.

## 2. Initial findings

The initial review identified the following important problems:

- Trip-level buttons sent `tripId` to an API that only accepted `bookingId`.
- Viewer accounts could enter the admin interface but could not load booking data.
- Two booking APIs contained overlapping and inconsistent admin logic.
- The dashboard mixed a legacy `payment_status` field with the newer booking-fee and fare statuses.
- Journey statuses were accepted as arbitrary strings without transition validation.
- Bookings could be permanently deleted from the dashboard.
- Booking mutations were not consistently written to `audit_logs`.
- Every booking was displayed in one table without operational filters or pagination.
- Reports, CSV files, and PDF manifests still used the legacy payment field.

## 3. Canonical admin booking API

The endpoint at `app/api/admin/bookings/route.ts` is now the canonical admin booking API.

Implemented behavior:

- `GET` requires the `viewBookings` permission.
- `PATCH` requires the `manageBookings` permission.
- Viewer accounts receive read-only booking access.
- Updates accept exactly one `bookingId` or `tripId` target.
- Trip updates can update every passenger belonging to a trip.
- Compatibility handlers in `/api/bookings` delegate admin operations to the canonical endpoint.
- Permanent deletion returns HTTP `405` with instructions to cancel the booking instead.
- Older bookings without a stored fare retain the configured-route fare fallback.

## 4. Journey lifecycle controls

A reusable lifecycle module was added at `lib/bookingLifecycle.ts`.

Supported operational sequence:

1. `Booked`
2. `Confirmed`
3. `Boarding`
4. `Departed`
5. `Arrived`
6. `Completed`

Cancellation is allowed before departure. `Completed` and `Cancelled` are terminal states. Repeating the current state remains idempotent.

The dashboard now displays only valid next actions, and the server independently validates every requested transition.

## 5. Cancellation workflow

Cancellation now requires an operational reason:

- Minimum length: 5 characters.
- Maximum length: 500 characters.
- The same reason can be applied to all passengers during a trip-wide cancellation.
- Pending or approved ambassador commissions are reversed with the cancellation reason.
- Paid commissions are preserved and returned as requiring manual review.
- The reason is stored in immutable audit metadata.
- Customers receive the reason through available notification channels.

Hard deletion has been removed from both the dashboard and booking APIs.

## 6. Rescheduling

Admins can reschedule individual bookings from the booking-details panel.

Rules:

- Only `Booked` and `Confirmed` journeys can be rescheduled.
- The new date must use `YYYY-MM-DD` format.
- Invalid calendar dates are rejected.
- Past dates are rejected.
- Rescheduling is limited to a single booking at a time.
- A new trip ID is generated from the destination and new travel date.
- The previous date, new date, previous trip ID, and new trip ID are recorded in the audit entry.
- The customer is notified of the new date.

## 7. Payment model cleanup

The admin workflow now treats the following as the sources of payment truth:

- `booking_fee_status`
- `fare_status`
- `fare_payment_method`

The dashboard no longer uses the legacy single payment field to calculate revenue or determine whether a receipt is available.

Additional safeguards:

- Cash fare collection is only allowed after the customer selects cash payment.
- Cash collection records the collecting staff member and collection time.
- Booking-fee and fare totals are calculated independently.
- Student spending totals count only money actually received.
- The old `/api/payments/confirm` endpoint now returns HTTP `410 Gone`.
- Guest tracking no longer exposes the legacy payment field.

## 8. Receipts

Receipt generation and delivery now use the split payment fields.

- A receipt is available after either a booking fee or transport fare has been received.
- Receipt labels state whether the payment was a booking fee or transport fare.
- The booking ID is used as a safe receipt reference when no older receipt number exists.
- Receipt emails use the actual settlement timestamps.
- Receipt delivery is written to the audit log.

## 9. Admin booking workspace

The Bookings tab now provides:

- Search by passenger, student ID, destination, trip ID, booking ID, or phone.
- University/campus filtering.
- Journey-status filtering.
- Booking-fee payment filtering.
- Fare payment filtering.
- Travel-date filtering.
- Clear-filter control.
- Client-side pagination at 25 bookings per page.
- A booking-details action on every row.
- Viewer-safe read-only behavior.

The overview financial cards use only the real booking-fee and fare settlement fields.

## 10. Booking details and audit timeline

A dedicated details panel was added at `app/admin/components/BookingDetailsPanel.tsx`.

It displays:

- Booking and trip IDs.
- Passenger and student information.
- Phone and email.
- Destination, campus, pickup, date, and seats.
- Journey status.
- Booking-fee amount and status.
- Fare amount, status, and payment method.
- Receipt-delivery status.
- Payment notes.
- Rescheduling controls when permitted.
- The latest 50 audited admin activities.

Audit entries show the action, actor role, time, and cancellation reason where applicable.

## 11. Customer notifications

Cancellation and rescheduling can notify customers through three channels:

- Email through Resend.
- SMS through Africa's Talking.
- In-app notification for bookings linked to a registered customer profile.

Notification failures do not roll back a successful booking update. Missing provider credentials cause the relevant channel to skip safely and write diagnostic logs.

SMS cancellation reasons are shortened to control message length and cost. Full reasons remain in email and the audit history.

## 12. Reports and manifests

The reporting workflow was migrated away from the legacy payment field.

Updated areas:

- Admin report filters.
- Report summary cards.
- Desktop report tables.
- Mobile report cards.
- Passenger details.
- CSV exports.
- PDF passenger manifests.

Reports now expose independent booking-fee and fare statuses. Viewer access was corrected to use the existing `viewReports` permission.

## 13. Audit coverage

Audit records are now written for:

- Individual booking status changes.
- Trip-wide status changes.
- Booking cancellations.
- Booking rescheduling.
- Cash fare collection.
- Receipt delivery.

Audit writes use the current `audit_logs` schema:

- `actor_user_id`
- `actor_role`
- `action`
- `entity_type`
- `entity_id`
- `previous_value`
- `new_value`
- `ip_address`
- `user_agent`
- `metadata`

Audit failures are logged but do not report a successful booking operation as failed.

## 14. Automated tests

New tests cover:

- Journey status normalization.
- Valid operational transitions.
- Rejected status skips.
- Terminal-state behavior.
- Cancellation availability.
- Rescheduling eligibility.
- ISO date validation.
- Past-date rejection.
- Split payment report filters.
- Booking-fee and fare report summaries.

Final result: **70 passing tests, 0 failures**.

## 15. Supabase readiness

The Supabase schema was checked manually after implementation.

Confirmed booking columns:

- `booking_expires_at`
- `booking_fee_amount`
- `booking_fee_paid_at`
- `booking_fee_status`
- `customer_id`
- `fare`
- `fare_cash_collected_at`
- `fare_cash_collected_by`
- `fare_paid_at`
- `fare_payment_method`
- `fare_status`
- `route_id`
- `university_id`

Confirmed supporting tables:

- `audit_logs`
- `communication_notifications`
- `payments`
- `payment_events`
- `universities`
- `routes`

**Database conclusion:** no SQL needs to be applied for the changes in this report.

## 16. Main files affected

- `app/admin/page.tsx`
- `app/admin/components/BookingDetailsPanel.tsx`
- `app/admin/reports/page.tsx`
- `app/api/admin/bookings/route.ts`
- `app/api/bookings/route.ts`
- `app/api/payments/confirm/route.ts`
- `app/api/payments/fare/confirm-cash/route.ts`
- `app/api/payments/send-receipt/route.ts`
- `app/api/reports/route.ts`
- `app/api/track-booking/route.ts`
- `app/components/home/TrackModal.tsx`
- `lib/africasTalking.ts`
- `lib/bookingLifecycle.ts`
- `lib/bookingLifecycle.test.ts`
- `lib/communicationEngine.ts`
- `lib/csvUtils.ts`
- `lib/reportPdf.ts`
- `lib/reportUtils.ts`
- `lib/reportUtils.test.ts`
- `package.json`

## 17. Deployment checklist

Before production release:

1. Confirm `RESEND_API_KEY` is configured if email delivery is required.
2. Confirm `AFRICASTALKING_USERNAME` and `AFRICASTALKING_API_KEY` are configured if SMS delivery is required.
3. Test one cancellation using a non-production customer address and phone.
4. Test one rescheduling notification.
5. Confirm an audit entry appears in the booking-details timeline.
6. Confirm a viewer can open bookings and reports but cannot mutate records.
7. Confirm an admin can update a complete trip and all passenger rows change together.
8. Confirm CSV and PDF manifests show booking-fee and fare statuses.

## 18. Remaining roadmap

Recommended future work:

1. Refund and partial-refund workflows.
2. Payment-exception queue for failed or mismatched payments.
3. Automatic expiry and seat release for unpaid bookings.
4. Internal booking notes and operational flags.
5. Vehicle assignment, capacity enforcement, and seat numbers.
6. Passenger transfer between trips.
7. Bulk booking selection and bulk communication.
8. Server-side pagination, filtering, and search.
9. Authenticated realtime booking updates.
10. Notification delivery tracking and retry queues.
11. Split the remaining large admin page into focused modules.
12. Remove the legacy database payment column after historical compatibility is confirmed.

## 19. Repository note

The repository already contained unrelated uncommitted work before this booking upgrade began. Those existing changes were preserved. This report describes the booking/admin work performed during this upgrade sequence and should not be treated as a complete description of every modified file currently visible in `git status`.
