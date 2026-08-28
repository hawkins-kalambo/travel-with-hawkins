import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;

export function verifyMetaSignature(rawBody: string | Buffer, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const match = SIGNATURE_PATTERN.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const provided = Buffer.from(match[1], "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
