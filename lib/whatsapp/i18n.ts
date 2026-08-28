import type { WhatsAppLanguage } from "@/lib/whatsapp/types";

export const english = {
  welcome: "Welcome to Travel With Hawkins. Please choose your language.",
  languageChanged: "Language changed to English.",
  mainMenu: "How can we help you today?",
  menuRoutes: "Find a Route",
  menuBooking: "Make a Booking",
  menuPayment: "Pay Booking Fee",
  menuTracking: "Track My Booking",
  menuQuestion: "Ask a Question",
  menuAgent: "Talk to an Agent",
  menuLanguage: "Change Language",
  chooseFromList: "Choose an option, or type its number.",
  askOrigin: "Which district are you travelling from?",
  askDestination: "Choose an available destination and departure.",
  noRoutes: "No configured routes are available right now. Would you like a human agent to help?",
  noDepartures: "That route has no published travel dates right now. Would you like a human agent to help?",
  routesUnavailable: "Sorry, I can't look up routes right now. I've brought you back to the main menu — try again shortly, or type agent for a person.",
  askName: "What is the passenger's full name?",
  askEmail: "What is the passenger's email address? Type skip if none.",
  askStudentId: "What is the student or customer ID? Type skip if none.",
  askSeats: "How many passengers? Enter a number from 1 to 10.",
  invalidSeats: "Please enter a whole number from 1 to 10.",
  confirmBooking: "Please confirm this booking:",
  confirmed: "Confirm",
  cancel: "Cancel",
  bookingCreated: "Booking created successfully. Your booking ID is {bookingId}.",
  bookingDuplicate: "This booking was already created. Your booking ID is {bookingId}.",
  bookingFailed: "We could not create that booking safely. No payment was taken. Please try again or talk to an agent.",
  seatsUnavailable: "Those seats are no longer available. Please choose another departure or talk to an agent.",
  askBookingIdPayment: "Enter your booking ID to create or check a booking-fee payment.",
  paymentLink: "Use this secure PayChangu link to pay the booking fee: {url}\nNever send your PIN or payment credentials in WhatsApp.",
  paymentPaid: "The booking fee for {bookingId} is confirmed as paid.",
  paymentPending: "The booking fee is not yet confirmed. Use PayChangu or check again later.",
  paymentFailed: "We could not safely start or verify that payment. Check the booking details or talk to an agent.",
  askBookingIdTracking: "Enter the booking ID. We will match it to this WhatsApp phone number.",
  trackingNotFound: "We could not find a booking matching that ID and this WhatsApp number.",
  trackingResult: "Booking {bookingId}\nRoute: {route}\nTravel date: {date}\nJourney: {journey}\nBooking fee: {payment}\nPickup: {pickup}",
  askQuestion: "Ask a short question about Travel With Hawkins services, routes, bookings, payments, luggage, or pickup.",
  unrelatedQuestion: "I can only help with Travel With Hawkins transport services. Choose an option from the menu or talk to an agent.",
  aiUnavailable: "I cannot answer that confidently right now. Would you like a human agent to help?",
  agentWaiting: "A support agent has been requested. Automated replies are now paused.",
  agentActive: "A Travel With Hawkins agent is handling this conversation.",
  returnedToBot: "Automated help is available again.",
  cancelled: "Cancelled. Returning to the main menu.",
  restarted: "Let's start again.",
  back: "Going back.",
  invalidInput: "I did not understand that. Use the menu, or type menu, back, cancel, or agent.",
  optedOut: "You have opted out of non-essential WhatsApp messages. Type START to use support again.",
  optedIn: "WhatsApp support is active again.",
  systemError: "Something went wrong on our side. Type menu to start over, or agent to reach a person. Nothing was charged.",
} as const;

export type TranslationKey = keyof typeof english;

export const chichewa: Record<TranslationKey, string> = {
  welcome: "Takulandirani ku Travel With Hawkins. Sankhani chilankhulo.",
  languageChanged: "Chilankhulo chasinthidwa kukhala Chichewa.",
  mainMenu: "Kodi tingakuthandizeni bwanji lero?",
  menuRoutes: "Pezani Ulendo",
  menuBooking: "Pangani Booking",
  menuPayment: "Lipirani Booking Fee",
  menuTracking: "Tsatirani Booking",
  menuQuestion: "Funsani Funso",
  menuAgent: "Lankhulani ndi Agent",
  menuLanguage: "Sinthani Chilankhulo",
  chooseFromList: "Sankhani pa mndandanda, kapena lembani nambala yake.",
  askOrigin: "Mukunyamuka ku district iti?",
  askDestination: "Sankhani komwe mukupita ndi tsiku la ulendo lomwe lilipo.",
  noRoutes: "Palibe ma route okonzedwa omwe alipo pano. Kodi mufuna agent akuthandizeni?",
  noDepartures: "Route imeneyi ilibe masiku a ulendo omwe afalitsidwa pano. Kodi mufuna agent?",
  routesUnavailable: "Pepani, sindingathe kupeza ma route pakadali pano. Ndakubwezerani ku menu yaikulu — yesaninso posachedwa, kapena lembani agent.",
  askName: "Dzina lonse la passenger ndi ndani?",
  askEmail: "Imelo ya passenger ndi iti? Lembani skip ngati palibe.",
  askStudentId: "Student kapena customer ID ndi iti? Lembani skip ngati palibe.",
  askSeats: "Ndi anthu angati? Lembani nambala kuyambira 1 mpaka 10.",
  invalidSeats: "Lembani nambala yonse kuyambira 1 mpaka 10.",
  confirmBooking: "Tsimikizirani booking iyi:",
  confirmed: "Tsimikizani",
  cancel: "Letsani",
  bookingCreated: "Booking yapangidwa. Booking ID yanu ndi {bookingId}.",
  bookingDuplicate: "Booking iyi inapangidwa kale. Booking ID yanu ndi {bookingId}.",
  bookingFailed: "Sitinathe kupanga booking mosamala. Palibe ndalama zomwe zatengedwa. Yesaninso kapena lankhulani ndi agent.",
  seatsUnavailable: "Mipando imeneyo yatha. Sankhani ulendo wina kapena lankhulani ndi agent.",
  askBookingIdPayment: "Lembani booking ID kuti mupange kapena muone payment ya booking fee.",
  paymentLink: "Gwiritsani ntchito link yotetezeka ya PayChangu iyi: {url}\nMusatumize PIN kapena zachinsinsi za payment pa WhatsApp.",
  paymentPaid: "Booking fee ya {bookingId} yatsimikizidwa kuti yalipidwa.",
  paymentPending: "Booking fee sinatsimikizidwebe. Gwiritsani ntchito PayChangu kapena onaninso nthawi ina.",
  paymentFailed: "Sitinathe kuyambitsa kapena kutsimikizira payment mosamala. Onani booking kapena lankhulani ndi agent.",
  askBookingIdTracking: "Lembani booking ID. Tiyifananitsa ndi nambala ya WhatsApp iyi.",
  trackingNotFound: "Sitidapeze booking yogwirizana ndi ID imeneyo ndi nambala ya WhatsApp iyi.",
  trackingResult: "Booking {bookingId}\nRoute: {route}\nTsiku: {date}\nUlendo: {journey}\nBooking fee: {payment}\nPickup: {pickup}",
  askQuestion: "Funsani funso lalifupi lokhudza Travel With Hawkins, ma route, booking, payment, katundu, kapena pickup.",
  unrelatedQuestion: "Ndingathandize pa ntchito za Travel With Hawkins zokha. Sankhani pa menu kapena lankhulani ndi agent.",
  aiUnavailable: "Sindingayankhe motsimikiza pano. Kodi mufuna agent akuthandizeni?",
  agentWaiting: "Tapempha support agent. Mayankho a bot ayimitsidwa.",
  agentActive: "Agent wa Travel With Hawkins akusamalira conversation iyi.",
  returnedToBot: "Thandizo la bot layambiranso.",
  cancelled: "Zaletsedwa. Tikubwerera ku main menu.",
  restarted: "Tiyambirenso.",
  back: "Tikubwerera m'mbuyo.",
  invalidInput: "Sindinamvetse. Gwiritsani ntchito menu, kapena lembani menu, back, cancel, kapena agent.",
  optedOut: "Mwaletsa mauthenga osafunikira a WhatsApp. Lembani START kuti mugwiritsenso ntchito support.",
  optedIn: "Support ya WhatsApp yayambiranso.",
  systemError: "Pakhala vuto kumbali yathu. Lembani menu kuti muyambenso, kapena agent kuti mulankhule ndi munthu. Palibe ndalama zomwe zatengedwa.",
};

// Product/legal reviewers should review these mixed operational terms before
// production activation; they remain explicit rather than being presented as
// silently authoritative translations.
export const chichewaHumanReviewKeys: TranslationKey[] = [
  "menuPayment", "agentWaiting", "paymentPending", "trackingResult", "askStudentId",
  "routesUnavailable", "systemError",
];

export function t(language: WhatsAppLanguage, key: TranslationKey, values: Record<string, string | number> = {}): string {
  const resource = language === "ny" ? chichewa : english;
  const template = resource[key] || english[key];
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), template);
}

export function hasCompleteTranslations(): boolean {
  return (Object.keys(english) as TranslationKey[]).every((key) => Boolean(chichewa[key]));
}
