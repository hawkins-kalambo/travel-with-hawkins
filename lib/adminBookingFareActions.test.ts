import assert from "node:assert/strict";
import test from "node:test";

import { canConfirmCashFare, canRecordManualFarePayment } from "./adminBookingFareActions.ts";

test("admin can confirm cash fare only after booking fee is paid and fare is cash selected", () => {
  assert.equal(canConfirmCashFare("paid", "cash_selected"), true);
  assert.equal(canConfirmCashFare("paid", "paid"), false);
  assert.equal(canConfirmCashFare("paid", "cash_collected"), false);
  assert.equal(canConfirmCashFare("unpaid", "cash_selected"), false);
});

test("admin can record manual fare payment for settled booking fees before fare is finalized", () => {
  assert.equal(canRecordManualFarePayment("paid", "cash_selected"), true);
  assert.equal(canRecordManualFarePayment("paid", "unpaid"), true);
  assert.equal(canRecordManualFarePayment("paid", "paid"), false);
  assert.equal(canRecordManualFarePayment("paid", "cash_collected"), false);
  assert.equal(canRecordManualFarePayment("unpaid", "cash_selected"), false);
});
