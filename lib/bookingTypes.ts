export type JourneyStatus =
  | "Booked"
  | "Confirmed"
  | "Boarding"
  | "Arrived"
  | "Completed"
  | "Cancelled"
  | string;

export type PaymentStatus =
  | "Pending"
  | "Payment Confirmed"
  | "Failed"
  | string;

export type BookingRecord = {
  bookingId?: string;
  tripId?: string;
  name?: string;
  phone?: string;
  email?: string;
  studentId?: string;
  destination?: string;
  travelDate?: string;
  seats?: number;
  pickup?: string;
  location?: string;
  bookingType?: string;

  // Journey status only
  status?: JourneyStatus;

  // Payment status is independent from journey status
  paymentStatus?: PaymentStatus;
  paymentConfirmedAt?: string;
  receiptNumber?: string;
  receiptSent?: boolean;
  paymentNotes?: string;

  createdAt?: string;
  updatedAt?: string;
  timestamp?: unknown;
};

