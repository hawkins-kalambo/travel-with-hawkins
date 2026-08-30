import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";

// Split a typed route into its two ends. Accepts, case-insensitively:
//   "Lilongwe to Mzuzu", "From Zomba to Lilongwe", "Kasungu - Mzuzu",
//   "Karonga → Mzuzu", "Lilongwe -> Mzuzu University",
//   "I want to travel from Blantyre to Mzuzu", "MZUNI to Lilongwe".
// One place on its own ("Lilongwe") returns { kind: "single" } so the caller
// can ask which end it is. Anything that doesn't look like a route returns null.

const SEPARATOR = /\s+(?:to|->|→|–|—|-)\s+/i;
const PLACE_RE = /^[\p{L}][\p{L}\s.'()-]{1,60}$/u;

// Conversational lead-ins customers put before the actual route. Stripped so
// "I want to travel from Blantyre to Mzuzu" reduces to "Blantyre to Mzuzu".
const LEAD_IN_RE = /^\s*(?:i\s+(?:would\s+like|want|need|wanna|wish)\s+to\s+(?:travel|go|book|ride)|can\s+you\s+(?:take|book|get)\s+me|please\s+(?:take|book|help)\s+me|i'?m\s+(?:travelling|traveling|going)|book\s+me|take\s+me|get\s+me)\s+/i;

export type ParsedRoute =
  | { kind: "pair"; origin: string; destination: string }
  | { kind: "single"; place: string }
  | null;

function cleanPlace(value: string): string {
  return value.trim().replace(/[.,;:!?]+$/g, "").replace(/\s+/g, " ").trim();
}

function isPlace(value: string): boolean {
  return PLACE_RE.test(value) && value.split(/\s+/).length <= 4;
}

export function parseTypedRoute(raw: string): ParsedRoute {
  const stripped = String(raw || "").replace(LEAD_IN_RE, "").replace(/^\s*from\s+/i, "");
  const text = cleanPlace(stripped);
  if (!text) return null;

  const parts = text.split(SEPARATOR).map(cleanPlace).filter(Boolean);
  if (parts.length >= 2) {
    const origin = parts[0];
    const destination = parts.slice(1).join(" ");
    // A place name is a few words at most — reject "I want to go somewhere ...".
    if (isPlace(origin) && isPlace(destination)) {
      return { kind: "pair", origin, destination };
    }
    return null;
  }

  // A bare place name — at most four words, letters only.
  if (isPlace(text)) {
    return { kind: "single", place: text };
  }
  return null;
}

// Case/spacing-insensitive match against the 28 Malawi districts.
export function matchDistrict(place: string): string | null {
  const norm = cleanPlace(place).toLowerCase();
  if (!norm) return null;
  return (MALAWI_DISTRICTS as readonly string[]).find((d) => d.toLowerCase() === norm) ?? null;
}

// Heuristic only — the authoritative check is against the active universities
// list in the DB. Used to decide whether an unmatched place is worth trying as
// a university before giving up.
export function looksLikeUniversity(place: string): boolean {
  const v = cleanPlace(place).toLowerCase();
  if (!v) return false;
  return /\buniversity\b|\bcollege\b|\bcampus\b/.test(v)
    || /\b(mzuni|unima|mubas|must|luanar|kuhes)\b/.test(v);
}
