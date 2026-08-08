export function canConfirmCashFare(bookingFeeStatus: string | null | undefined, fareStatus: string | null | undefined): boolean {
  return bookingFeeStatus === "paid" && fareStatus === "cash_selected";
}

export function canRecordManualFarePayment(bookingFeeStatus: string | null | undefined, fareStatus: string | null | undefined): boolean {
  return bookingFeeStatus === "paid" && fareStatus !== "paid" && fareStatus !== "cash_collected";
}
