# TODO

## Payment → Overview update fix
- [ ] Add Apps Script action `confirmPayment` that sets booking `Status` to `Confirmed` by `bookingId` or `tripId`.
- [ ] Add admin UI button to mark a booking/trip as paid/confirmed (calls `confirmPayment` or reuses existing `updateStatus`).
- [ ] Ensure revenue/overview uses booking fair + fee correctly after status becomes `Confirmed`.
- [ ] Test flow end-to-end: create booking → admin mark paid/confirm → admin overview + stepper update.

