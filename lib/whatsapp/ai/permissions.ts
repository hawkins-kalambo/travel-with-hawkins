// The AI permission matrix (Stage 1). Master plan §5. This is the single
// source of truth for what each tool is allowed to touch; the tool registry
// enforces it, and nothing the model says can widen it.

export type ToolScope =
  // Approved public information — no authenticated sender needed.
  | "public"
  // That customer's own data — requires a verified WhatsApp contact id.
  | "customer"
  // Prepares or submits a record — requires a verified contact id, and the
  // final transactional step additionally requires an explicit confirmation
  // token issued by the server (never by the model).
  | "write";

export type ToolPermission = {
  scope: ToolScope;
  // Extra gate for the irreversible step of a write flow (booking confirm).
  requiresConfirmationToken?: boolean;
  // The feature flag that must be on for this tool to run at all.
  feature?: "assistant" | "liveTools" | "bookingDrafts" | "routeAlternatives" | "personalization";
  // One line for the admin permission view.
  summary: string;
};

export const AI_TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  // --- public, read-only ---
  searchActiveRoutes:     { scope: "public", feature: "liveTools", summary: "Active routes for an origin/destination" },
  listPopularRoutes:      { scope: "public", feature: "liveTools", summary: "Admin-curated popular routes" },
  getRouteDetails:        { scope: "public", feature: "liveTools", summary: "One active route's public detail" },
  listActiveUniversities: { scope: "public", feature: "liveTools", summary: "Active universities + short codes" },
  resolveUniversity:      { scope: "public", feature: "liveTools", summary: "Match a name/abbreviation to an active university" },
  getPickupPoints:        { scope: "public", feature: "liveTools", summary: "Pickup points for a route" },
  findScheduledTrips:     { scope: "public", feature: "liveTools", summary: "Published trips for a route + date" },
  getPublicFare:          { scope: "public", feature: "liveTools", summary: "Published fare for a route" },
  searchApprovedKnowledge:{ scope: "public", summary: "Approved FAQ / policy answers" },

  // --- customer-scoped, read-only (verified sender) ---
  getCustomerBookings:      { scope: "customer", feature: "liveTools", summary: "The sender's own bookings" },
  getCustomerBooking:       { scope: "customer", feature: "liveTools", summary: "One of the sender's bookings" },
  getCustomerPaymentStatus: { scope: "customer", feature: "liveTools", summary: "Verified payment status for the sender's booking" },
  getCustomerReceipt:       { scope: "customer", feature: "liveTools", summary: "Receipt for the sender's paid booking" },
  calculateBookingFeeDeadline: { scope: "customer", feature: "liveTools", summary: "Fee deadline for the sender's booking" },
  getConversationContext:   { scope: "customer", summary: "Safe summary of the current conversation" },

  // --- controlled writes (never final-confirm on their own) ---
  createBookingDraft:   { scope: "write", feature: "bookingDrafts", summary: "Start a booking draft from validated data" },
  updateBookingDraft:   { scope: "write", feature: "bookingDrafts", summary: "Amend the sender's booking draft" },
  confirmBookingDraft:  { scope: "write", feature: "bookingDrafts", requiresConfirmationToken: true, summary: "Create the booking via the deterministic service" },
  createRouteRequest:   { scope: "write", summary: "Log a request for a corridor we don't run yet" },
  requestHumanAgent:    { scope: "write", summary: "Raise a support request (bot keeps serving)" },
  submitAssistantFeedback: { scope: "write", summary: "Record a Helpful / Still-need-help signal" },
};

// Actions the AI must NEVER be able to trigger, directly or via a tool. Kept
// explicit so a future tool addition is checked against it.
export const AI_FORBIDDEN_ACTIONS: readonly string[] = [
  "confirm a booking without customer confirmation",
  "mark a payment as paid",
  "issue a refund",
  "change a fare",
  "activate a route",
  "create an admin route",
  "change trip capacity",
  "assign a vehicle",
  "cancel a trip",
  "delete a booking",
  "reveal another customer's information",
  "modify administrator permissions",
];

export function getToolPermission(tool: string): ToolPermission | null {
  return Object.prototype.hasOwnProperty.call(AI_TOOL_PERMISSIONS, tool)
    ? AI_TOOL_PERMISSIONS[tool] : null;
}

export function isKnownTool(tool: string): boolean {
  return getToolPermission(tool) !== null;
}
