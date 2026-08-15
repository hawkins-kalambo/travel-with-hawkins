"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "./components/home/SiteHeader";
import HeroSection from "./components/home/HeroSection";
import TripSearchCard from "./components/home/TripSearchCard";
import StatsStrip from "./components/home/StatsStrip";
import PopularRoutesSection from "./components/home/PopularRoutesSection";
import AccountBenefitsSection from "./components/home/AccountBenefitsSection";
import WhyChooseUsSection from "./components/home/WhyChooseUsSection";
import TeamSection from "./components/home/TeamSection";
import AppBanner from "./components/home/AppBanner";
import FAQSection from "./components/home/FAQSection";
import SiteFooter from "./components/home/SiteFooter";
import BookingModal, { type BookingFormState, type ReferralValidationState } from "./components/home/BookingModal";
import TrackModal from "./components/home/TrackModal";
import BookingSuccessModal, { type BookingSuccessData } from "./components/home/BookingSuccessModal";
import WhatsAppButton from "./components/WhatsAppButton";
import WebsiteChatWidget from "./components/WebsiteChatWidget";
import { normalizeBookingRecord } from "@/lib/bookingClientUtils";
import { parseRoutePrices, resolveRouteFareIfAvailable } from "@/lib/routePricing";
import { REFERRAL_STORAGE_KEY, resolveInitialReferral, type ReferralSource } from "@/lib/referralStorage";
import { fetchActiveUniversities, type ActiveUniversity } from "@/lib/universitiesClient";
import { fetchActiveRoutes } from "@/lib/routesClient";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { buildJourneyName, type JourneyDirection } from "@/lib/journeyDirection";

type BookingStatus = "Booked" | "Confirmed" | "Boarding" | "Departed" | "Arrived" | "Completed" | "Cancelled" | string;
type BookingRecord = {
  destination?: string;
  travelDate?: string;
  seats?: number;
  status?: BookingStatus;
  name?: string;
  bookingId?: string;
  bookingType?: string;
  paymentStatus?: string;
  [key: string]: unknown;
};

type RouteOption = { routeId: string; label: string };

type HomeProps = {
  initialTrip?: {
    destination: string;
    travelDate?: string;
    seats?: number;
    routeId?: string;
    routeOptions?: RouteOption[];
    journeyDirection?: JourneyDirection;
    homeDistrict?: string;
    university?: string;
  };
  initialReferralCode?: string | null;
};

export default function Home({ initialTrip, initialReferralCode }: HomeProps = {}) {
  const router = useRouter();
  const tripSearchRef = useRef<HTMLFormElement>(null);
  const departureSelectRef = useRef<HTMLSelectElement>(null);
  const [bookingType, setBookingType] = useState<"route" | "custom">("custom");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [departureDistrict, setDepartureDistrict] = useState(initialTrip?.homeDistrict ?? "Lilongwe");
  const [destinationUniversity, setDestinationUniversity] = useState(initialTrip?.university ?? "");
  const [journeyDirection, setJourneyDirection] = useState<JourneyDirection>(initialTrip?.journeyDirection ?? "to_university");
  const [customDestination, setCustomDestination] = useState(initialTrip?.destination ?? "");
  const [showBooking, setShowBooking] = useState(Boolean(initialTrip?.destination || initialReferralCode));
  const [showTrack, setShowTrack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trackId, setTrackId] = useState("");
  const [trackContact, setTrackContact] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [trackResult, setTrackResult] = useState<BookingRecord | null>(null);
  const [urgencyDestination, setUrgencyDestination] = useState<string | null>(null);
  const [routePrices, setRoutePrices] = useState<Record<string, number>>({});
  const [settingsText, setSettingsText] = useState<string | Record<string, unknown>>("");
  const [universities, setUniversities] = useState<string[]>([]);
  const [activeUniversities, setActiveUniversities] = useState<ActiveUniversity[]>([]);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>(initialTrip?.routeOptions ?? []);
  const [selectedRouteId, setSelectedRouteId] = useState(initialTrip?.routeId ?? "");
  const [successData, setSuccessData] = useState<BookingSuccessData | null>(null);
  const [referralValidation, setReferralValidation] = useState<ReferralValidationState>({ state: "idle" });
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null);
  const [today, setToday] = useState("");
  const [form, setForm] = useState<BookingFormState>({
    name: "",
    studentId: "",
    phone: "",
    email: "",
    seats: initialTrip?.seats ?? 1,
    referralCode: "",
    travelDate: initialTrip?.travelDate || "",
  });

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const currentDate = new Date().toISOString().split("T")[0];
      let savedProfile: { name?: string; studentId?: string; phone?: string } = {};

      try {
        const rawProfile = localStorage.getItem("twh_profile");
        if (rawProfile) savedProfile = JSON.parse(rawProfile) as typeof savedProfile;
      } catch {}

      setToday(currentDate);
      setForm((current) => ({
        ...current,
        name: savedProfile.name || current.name,
        studentId: savedProfile.studentId || current.studentId,
        phone: savedProfile.phone || current.phone,
        travelDate: current.travelDate || currentDate,
      }));
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    // PII-free signal for the "seats filling fast" banner — never fetches
    // raw booking rows (those are admin-only, see GET /api/bookings).
    const fetchUrgencySignal = async () => {
      try {
        const res = await fetch("/api/bookings/urgency");
        const data = await res.json();
        setUrgencyDestination(typeof data?.destination === "string" ? data.destination : null);
      } catch {}
    };

    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const data = await res.json();
        const rawSettings = data?.settings;
        const routesText = typeof rawSettings?.routes === "string" ? rawSettings.routes : "";
        const parsedPrices = parseRoutePrices(rawSettings);
        setRoutePrices(parsedPrices);
        setSettingsText(typeof rawSettings === "object" && rawSettings != null ? rawSettings : routesText);
      } catch {}
    };

    const fetchUniversities = async () => {
      const active = await fetchActiveUniversities();
      setUniversities(active.map((u) => u.name));
      setActiveUniversities(active);

      if (active.length > 0) {
        const mzuzu = active.find((university) => university.name.startsWith("Mzuzu University"));
        if (mzuzu) {
          const popularDistricts = ["Lilongwe", "Blantyre", "Zomba", "Kasungu", "Karonga"];
          const routeResults = await Promise.all(
            popularDistricts.map(async (district) => ({
              district,
              routes: await fetchActiveRoutes(district, mzuzu.id, "to_university"),
            }))
          );
          const structuredPrices: Record<string, number> = {};
          for (const result of routeResults) {
            const fare = result.routes[0]?.fare;
            if (typeof fare === "number" && fare > 0) structuredPrices[`${result.district} - Mzuzu`] = fare;
          }
          setRoutePrices((current) => ({ ...current, ...structuredPrices }));
        }
      }
    };

    fetchUrgencySignal();
    const loadRouteConfiguration = async () => {
      await fetchSettings();
      await fetchUniversities();
    };
    void loadRouteConfiguration();
    const interval = setInterval(fetchUrgencySignal, 30000);
    return () => clearInterval(interval);
  }, []);

  const isFormValid = () =>
    Boolean(form.name.trim() && normalizeMalawiPhone(form.phone) && form.seats >= 1 && form.travelDate.trim() && !(routeOptions.length > 1 && !selectedRouteId));
  const getFareForDestination = (destination: string) => resolveRouteFareIfAvailable(destination, settingsText);
  const urgencyDisplay = urgencyDestination;
  const tripSearchReady = Boolean(departureDistrict && destinationUniversity);

  const openBooking = (route = "") => {
    const popularHomeDistrict = route.split(" - ")[0]?.trim();
    if (route && popularHomeDistrict) {
      setDepartureDistrict(popularHomeDistrict);
      setDestinationUniversity("Mzuzu University (MZUNI)");
      setJourneyDirection("to_university");
    }
    setSelectedRoute(route);
    setBookingType(route ? "route" : "custom");
    setCustomDestination("");
    setRouteOptions([]);
    setSelectedRouteId("");
    setError("");
    setShowBooking(true);
  };

  const openPopularRoute = (route: string) => {
    const homeDistrict = route.split(" - ")[0]?.trim() || "";
    const universityName = "Mzuzu University (MZUNI)";
    setDepartureDistrict(homeDistrict);
    setDestinationUniversity(universityName);
    setJourneyDirection("to_university");
    setSelectedRoute("");
    setBookingType("custom");
    setCustomDestination(buildJourneyName(homeDistrict, universityName, "to_university"));
    setRouteOptions([]);
    setSelectedRouteId("");
    setError("");
    setShowBooking(true);
  };

  useEffect(() => {
    // Safety net for Google/OAuth sign-in: Supabase falls back to the
    // project's Site URL (this homepage) whenever the redirectTo we pass
    // isn't in its allow-listed Redirect URLs, so a leftover ?code= can
    // land here instead of /auth/callback — stranding the user logged out
    // on the marketing page after they've already approved Google consent.
    // Forward it to the callback route so the session exchange still runs.
    const params = new URLSearchParams(window.location.search);
    if (params.get("code") || params.get("error") || params.get("error_description")) {
      router.replace(`/auth/callback${window.location.search}`);
    }
  }, [router]);

  useEffect(() => {
    // Lets other pages (e.g. the Payment page's "Haven't booked yet?" CTA)
    // deep-link straight into the booking modal via /?openBooking=1. Deferred
    // via setTimeout(0), same pattern as the profile-hydration effect above,
    // so this stays a "subscribe to external state on mount" effect rather
    // than calling setState synchronously in the effect body.
    const openBookingTimer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("openBooking") === "1") {
        openBooking();
      }
    }, 0);

    return () => window.clearTimeout(openBookingTimer);
  }, []);

  const closeBooking = () => {
    setShowBooking(false);
    setSelectedRoute("");
    setCustomDestination("");
    setBookingType("custom");
    setRouteOptions([]);
    setSelectedRouteId("");
    setError("");
  };

  const focusTripSearch = () => {
    tripSearchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    departureSelectRef.current?.focus({ preventScroll: true });
  };

  const handleTripSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tripSearchReady) return;

    const params = new URLSearchParams({
      departure: departureDistrict,
      university: destinationUniversity,
      direction: journeyDirection,
      date: form.travelDate,
      seats: String(form.seats),
    });
    router.push(`/trips?${params.toString()}`);
  };

  const clearStoredReferral = () => {
    try {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch {}
  };

  const validateReferralCode = async (code: string) => {
    if (!code.trim()) {
      setReferralValidation({ state: "idle" });
      return true;
    }

    setReferralValidation({ state: "checking", message: "Checking referral code..." });
    try {
      const res = await fetch("/api/referrals/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: code.trim() }),
      });
      const result = await res.json();
      if (result?.success && result?.valid) {
        const ambassadorName = result?.ambassador?.full_name || "your ambassador";
        setReferralValidation({ state: "valid", message: `Valid referral code — referred by ${ambassadorName}.`, ambassadorName });
        return true;
      }
      setReferralValidation({ state: "invalid", message: result?.message || "Invalid referral code." });
      return false;
    } catch {
      setReferralValidation({ state: "invalid", message: "Unable to verify referral code right now." });
      return false;
    }
  };

  useEffect(() => {
    // Only debounce codes the customer is actively typing — an
    // auto-captured link code is already validated once on mount, and
    // re-validating it here on every render would just repeat that call.
    if (referralSource !== "manual") return;
    const code = form.referralCode.trim();
    const debounceTimer = window.setTimeout(() => {
      if (!code) {
        setReferralValidation({ state: "idle" });
        return;
      }
      void validateReferralCode(code);
    }, 500);
    return () => window.clearTimeout(debounceTimer);
  }, [form.referralCode, referralSource]);

  useEffect(() => {
    // Capture ?ref=CODE from an ambassador's referral link (app/book/page.tsx
    // already sanitizes it server-side) and persist it so attribution
    // survives navigation/refresh — previously nothing did this at all
    // (see docs/ambassador-system-audit.md, AMB-001). A fresh link always
    // overwrites a previously stored code (last-click-wins); otherwise a
    // non-expired stored code is reused. Deferred via setTimeout(0), same
    // pattern as the profile-hydration effect above, so this stays a
    // "subscribe to external state on mount" effect rather than calling
    // setState synchronously in the effect body.
    const referralTimer = window.setTimeout(() => {
      let storedRaw: string | null = null;
      try {
        storedRaw = localStorage.getItem(REFERRAL_STORAGE_KEY);
      } catch {}

      const resolved = resolveInitialReferral({ urlCode: initialReferralCode, storedRaw });
      if (!resolved) return;

      if (resolved.nextStoredValue) {
        try {
          localStorage.setItem(REFERRAL_STORAGE_KEY, resolved.nextStoredValue);
        } catch {}
      }

      setForm((current) => (current.referralCode ? current : { ...current, referralCode: resolved.code }));
      setReferralSource(resolved.source);
      void validateReferralCode(resolved.code);
    }, 0);

    return () => window.clearTimeout(referralTimer);
  }, [initialReferralCode]);

  // Removes an ambassador's referral link/badge from the booking without
  // blocking checkout — used both when the customer explicitly dismisses
  // it and when an auto-captured code turns out to be stale (see below).
  const removeReferral = () => {
    setForm((current) => ({ ...current, referralCode: "" }));
    setReferralSource(null);
    setReferralValidation({ state: "idle" });
    clearStoredReferral();
  };

  const handleBooking = async () => {
    setError("");
    if (!isFormValid()) return setError("Please fill all required fields.");
    if (bookingType === "custom" && !customDestination.trim()) return setError("Please enter your destination.");

    let finalReferralCode = form.referralCode?.trim() || "";
    if (finalReferralCode) {
      const isValid = await validateReferralCode(finalReferralCode);
      if (!isValid) {
        if (referralSource === "link") {
          // The code was auto-captured from a shared link, not typed by
          // this customer — a stale/suspended/expired link shouldn't block
          // an otherwise-valid booking. Drop it silently and continue.
          finalReferralCode = "";
          removeReferral();
        } else {
          return setError("Please use a valid referral code or leave the field empty.");
        }
      }
    }

    setLoading(true);
    const destination = selectedRouteId || bookingType === "custom"
      ? customDestination.trim()
      : selectedRoute;
    const fare = getFareForDestination(destination);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          destination,
          pickup: journeyDirection === "from_university" ? destinationUniversity : departureDistrict,
          location: journeyDirection === "from_university" ? "University" : "Home district",
          bookingType,
          routeId: selectedRouteId || undefined,
          universityId: activeUniversities.find((university) => university.name === destinationUniversity)?.id,
          journeyDirection,
          homeDistrict: bookingType === "route" ? selectedRoute.split(" - ")[0]?.trim() || departureDistrict : departureDistrict,
          referralCode: finalReferralCode || undefined,
        }),
      });
      const result = await res.json();
      if (result?.success) {
        const normalized = normalizeBookingRecord(result.booking ?? {});
        const finalFare = normalized.fare ?? fare ?? resolveRouteFareIfAvailable(destination, settingsText);
        setSuccessData({
          name: form.name,
          studentId: form.studentId,
          phone: form.phone,
          route: destination,
          bookingType,
          travelDate: form.travelDate,
          seats: form.seats,
          bookingId: normalized.bookingId || result.bookingId || "PENDING",
          fare: finalFare,
          bookingFeeAmount: normalized.bookingFeeAmount,
          journeyDirection,
        });
        localStorage.setItem("twh_profile", JSON.stringify({ name: form.name.trim(), studentId: form.studentId.trim(), phone: form.phone.trim() }));
        closeBooking();
      } else {
        setError(String(result?.error || "Booking failed. Please try again."));
      }
    } catch {
      setError("Network error. Please check your connection.");
    }
    setLoading(false);
  };

  const trackBooking = async () => {
    setTrackError("");
    setTrackResult(null);
    if (!trackId.trim()) return setTrackError("Please enter a Booking ID.");
    if (!trackContact.trim()) return setTrackError("Please enter the email or phone number used when booking.");
    setTrackLoading(true);
    try {
      const res = await fetch("/api/track-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: trackId.trim(), contact: trackContact.trim() }),
      });
      const json = await res.json();
      if (json?.success && json.booking) setTrackResult(json.booking);
      else setTrackError(String(json?.error || "Booking not found."));
    } catch {
      setTrackError("Network error. Please try again.");
    }
    setTrackLoading(false);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[#101815]">
      <SiteHeader onOpenBooking={() => openBooking()} onOpenTrack={() => setShowTrack(true)} />

      {urgencyDisplay && (
        <div className="bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-800">
          Seats are filling fast for {urgencyDisplay}. Book early to secure your spot.
        </div>
      )}

      <HeroSection onOpenBooking={() => openBooking()} />

      <TripSearchCard
        formRef={tripSearchRef}
        departureSelectRef={departureSelectRef}
        departureDistrict={departureDistrict}
        onDepartureChange={setDepartureDistrict}
        destinationUniversity={destinationUniversity}
        onDestinationChange={setDestinationUniversity}
        journeyDirection={journeyDirection}
        onJourneyDirectionChange={setJourneyDirection}
        universities={universities}
        travelDate={form.travelDate}
        onDateChange={(value) => setForm({ ...form, travelDate: value })}
        seats={form.seats}
        onSeatsChange={(value) => setForm({ ...form, seats: value })}
        today={today}
        searchReady={tripSearchReady}
        onSubmit={handleTripSearch}
      />

      <StatsStrip />

      <PopularRoutesSection routePrices={routePrices} onBookRoute={openPopularRoute} onCustomize={focusTripSearch} />

      <AccountBenefitsSection />

      <WhyChooseUsSection />

      <TeamSection />

      <AppBanner />

      <FAQSection />

      <SiteFooter />

      <WhatsAppButton />
      <WebsiteChatWidget />

      {showBooking && (
        <BookingModal
          bookingType={bookingType}
          selectedRoute={selectedRoute}
          customDestination={customDestination}
          onSelectRoute={(route) => {
            setSelectedRoute(route);
            setBookingType("route");
            setCustomDestination("");
          }}
          onCustomDestinationChange={setCustomDestination}
          routeOptions={routeOptions}
          onRouteOptionsChange={setRouteOptions}
          selectedRouteId={selectedRouteId}
          onSelectRouteId={setSelectedRouteId}
          activeUniversities={activeUniversities}
          journeyDirection={journeyDirection}
          onJourneyDirectionChange={setJourneyDirection}
          initialHomeDistrict={departureDistrict}
          initialUniversityName={destinationUniversity}
          onHomeDistrictChange={setDepartureDistrict}
          onUniversityNameChange={setDestinationUniversity}
          error={error}
          form={form}
          onFormChange={(nextForm) => {
            if (nextForm.referralCode !== form.referralCode) {
              // The customer is now editing the field themselves — an
              // auto-captured link code becomes a manually-entered one,
              // which changes how a validation failure is handled later
              // (see handleBooking: manual entries block checkout on an
              // invalid code, auto-captured ones don't).
              setReferralSource("manual");
            }
            setForm(nextForm);
          }}
          referralValidation={referralValidation}
          referralSource={referralSource}
          onRemoveReferral={removeReferral}
          today={today}
          loading={loading}
          isFormValid={Boolean(isFormValid())}
          onSubmit={handleBooking}
          onClose={closeBooking}
        />
      )}

      {showTrack && (
        <TrackModal
          trackId={trackId}
          onTrackIdChange={setTrackId}
          trackContact={trackContact}
          onTrackContactChange={setTrackContact}
          trackLoading={trackLoading}
          trackError={trackError}
          trackResult={trackResult}
          settingsText={settingsText}
          onTrack={trackBooking}
          onClose={() => {
            setShowTrack(false);
            setTrackResult(null);
            setTrackError("");
            setTrackContact("");
          }}
        />
      )}

      {successData && <BookingSuccessModal successData={successData} onClose={() => setSuccessData(null)} />}
    </main>
  );
}
