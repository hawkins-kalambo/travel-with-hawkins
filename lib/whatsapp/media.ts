// Admin outbound WhatsApp attachments (master plan §C). PDF + JPEG + PNG only
// for the pilot. The content type is decided by SNIFFING THE BYTES, never by
// trusting the client-declared type or the filename extension.

export type WhatsAppMediaKind = "document" | "image";

export type MediaTypeSpec = { kind: WhatsAppMediaKind; ext: string; maxBytes: number };

const MB = 1024 * 1024;

// Per-type ceilings. Images are held to Meta's 5 MB image limit; documents to a
// conservative default that WHATSAPP_MEDIA_MAX_DOC_MB can lower (Meta allows
// 100 MB, but our hosting and the pilot do not need that).
function docMaxBytes(): number {
  const configured = Number(process.env.WHATSAPP_MEDIA_MAX_DOC_MB);
  const mb = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 95) : 16;
  return Math.round(mb * MB);
}

export function mediaWhitelist(): Record<string, MediaTypeSpec> {
  return {
    "application/pdf": { kind: "document", ext: "pdf", maxBytes: docMaxBytes() },
    "image/jpeg": { kind: "image", ext: "jpg", maxBytes: 5 * MB },
    "image/png": { kind: "image", ext: "png", maxBytes: 5 * MB },
  };
}

export const ALLOWED_MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const ABSOLUTE_MEDIA_MAX_BYTES = 95 * MB; // hard ceiling regardless of config

// Detect the real MIME type from the leading bytes. Returns null for anything
// not on the pilot whitelist.
export function sniffMediaType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf"; // "%PDF-"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  return null;
}

// Strip directories, control characters and anything outside a safe set;
// guarantee a non-empty stem and the extension the sniffed type requires.
export function sanitizeFilename(raw: string, ext: string): string {
  const base = String(raw || "").replace(/\\/g, "/").split("/").pop() || "";
  let cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  if (!cleaned) cleaned = "attachment";
  const stem = cleaned.replace(/\.[A-Za-z0-9]+$/, "").trim() || "attachment";
  return `${stem}.${ext}`;
}

export type MediaValidation =
  | { ok: true; kind: WhatsAppMediaKind; mimeType: string; ext: string; safeName: string }
  | { ok: false; reason: string };

// Validate already-fetched bytes. This is the authoritative check performed
// server-side just before sending; the declared type is only used to catch an
// obvious mismatch early.
export function validateMediaBytes(bytes: Uint8Array, declaredType: string, filename: string): MediaValidation {
  if (!bytes.length) return { ok: false, reason: "empty_file" };
  if (bytes.length > ABSOLUTE_MEDIA_MAX_BYTES) return { ok: false, reason: "file_too_large" };
  const sniffed = sniffMediaType(bytes);
  if (!sniffed) return { ok: false, reason: "unsupported_type" };
  const spec = mediaWhitelist()[sniffed];
  if (!spec) return { ok: false, reason: "unsupported_type" };
  if (bytes.length > spec.maxBytes) return { ok: false, reason: "file_too_large" };
  // A declared type that contradicts the bytes is rejected outright — no
  // "extension says PDF but it's an EXE" smuggling.
  if (declaredType && declaredType !== sniffed) return { ok: false, reason: "type_mismatch" };
  return { ok: true, kind: spec.kind, mimeType: sniffed, ext: spec.ext, safeName: sanitizeFilename(filename, spec.ext) };
}

// Cheap pre-check before a signed upload URL is issued, on the client-declared
// values only. The byte-level check above still runs before anything is sent.
export function validateMediaClaim(declaredType: string, byteSize: number, filename: string): MediaValidation {
  const spec = mediaWhitelist()[declaredType];
  if (!spec) return { ok: false, reason: "unsupported_type" };
  if (!Number.isFinite(byteSize) || byteSize <= 0) return { ok: false, reason: "empty_file" };
  if (byteSize > spec.maxBytes) return { ok: false, reason: "file_too_large" };
  return { ok: true, kind: spec.kind, mimeType: declaredType, ext: spec.ext, safeName: sanitizeFilename(filename, spec.ext) };
}

export function mediaReasonMessage(reason: string): string {
  switch (reason) {
    case "empty_file": return "The file is empty.";
    case "file_too_large": return "The file is larger than the allowed limit (PDF up to 16 MB, images up to 5 MB).";
    case "unsupported_type": return "Only PDF, JPEG and PNG files can be sent.";
    case "type_mismatch": return "The file content does not match its declared type.";
    default: return "The file could not be validated.";
  }
}
