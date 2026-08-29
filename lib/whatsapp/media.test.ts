import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaReasonMessage, sanitizeFilename, sniffInboundContainer, sniffMediaType,
  validateInboundMediaBytes, validateMediaBytes, validateMediaClaim,
} from "./media.ts";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test("sniffMediaType recognises the three allowed types and nothing else", () => {
  assert.equal(sniffMediaType(pdf), "application/pdf");
  assert.equal(sniffMediaType(jpeg), "image/jpeg");
  assert.equal(sniffMediaType(png), "image/png");
  assert.equal(sniffMediaType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), null); // MZ (exe)
  assert.equal(sniffMediaType(new Uint8Array([])), null);
});

test("sanitizeFilename strips paths, control chars and forces the extension", () => {
  assert.equal(sanitizeFilename("../../etc/passwd", "pdf"), "passwd.pdf");
  assert.equal(sanitizeFilename("my receipt.exe", "pdf"), "my receipt.pdf");
  assert.equal(sanitizeFilename("", "jpg"), "attachment.jpg");
  assert.equal(sanitizeFilename("....", "png"), "attachment.png");
  assert.equal(sanitizeFilename('a"b<c>d.pdf', "pdf"), "a b c d.pdf");
  assert.ok(sanitizeFilename("x".repeat(500), "pdf").endsWith(".pdf"));
});

test("validateMediaBytes accepts a real PDF and reports safe metadata", () => {
  const result = validateMediaBytes(pdf, "application/pdf", "Receipt #12.pdf");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.kind, "document");
    assert.equal(result.mimeType, "application/pdf");
    assert.equal(result.safeName, "Receipt 12.pdf");
  }
});

test("validateMediaBytes rejects a type/content mismatch (no smuggling)", () => {
  const result = validateMediaBytes(jpeg, "application/pdf", "invoice.pdf");
  assert.deepEqual(result, { ok: false, reason: "type_mismatch" });
});

test("validateMediaBytes rejects unknown content and empty input", () => {
  assert.deepEqual(validateMediaBytes(new Uint8Array([1, 2, 3, 4, 5]), "", "x"), { ok: false, reason: "unsupported_type" });
  assert.deepEqual(validateMediaBytes(new Uint8Array([]), "", "x"), { ok: false, reason: "empty_file" });
});

test("validateMediaBytes enforces the per-kind size ceiling", () => {
  const bigJpeg = new Uint8Array(6 * 1024 * 1024);
  bigJpeg.set([0xff, 0xd8, 0xff]);
  assert.deepEqual(validateMediaBytes(bigJpeg, "image/jpeg", "big.jpg"), { ok: false, reason: "file_too_large" });
});

test("validateMediaClaim gates on the declared type and size before an upload URL is issued", () => {
  assert.deepEqual(validateMediaClaim("application/zip", 10, "a.zip"), { ok: false, reason: "unsupported_type" });
  assert.deepEqual(validateMediaClaim("image/png", 9 * 1024 * 1024, "a.png"), { ok: false, reason: "file_too_large" });
  assert.deepEqual(validateMediaClaim("application/pdf", 0, "a.pdf"), { ok: false, reason: "empty_file" });
  const ok = validateMediaClaim("application/pdf", 5000, "plan.pdf");
  assert.equal(ok.ok, true);
});

test("mediaReasonMessage gives a human string for each reason", () => {
  for (const reason of ["empty_file", "file_too_large", "unsupported_type", "type_mismatch", "whatever"]) {
    assert.equal(typeof mediaReasonMessage(reason), "string");
    assert.ok(mediaReasonMessage(reason).length > 0);
  }
});

// --- inbound (customer-sent) media ---

test("sniffInboundContainer recognises a ZIP/OOXML container", () => {
  assert.equal(sniffInboundContainer(zip), "zip");
  assert.equal(sniffInboundContainer(pdf), "application/pdf");
  assert.equal(sniffInboundContainer(new Uint8Array([0x00, 0x01])), null);
});

test("validateInboundMediaBytes accepts a DOCX declared as a ZIP container", () => {
  const result = validateInboundMediaBytes(zip, DOCX);
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.kind, "document"); assert.equal(result.ext, "docx"); }
  assert.equal((validateInboundMediaBytes(zip, XLSX) as { ext?: string }).ext, "xlsx");
});

test("validateInboundMediaBytes still rejects a fake PDF and unknown types", () => {
  assert.deepEqual(validateInboundMediaBytes(zip, "application/pdf"), { ok: false, reason: "type_mismatch" });
  assert.deepEqual(validateInboundMediaBytes(new Uint8Array([0x4d, 0x5a]), "application/pdf"), { ok: false, reason: "unsupported_type" });
  assert.deepEqual(validateInboundMediaBytes(pdf, "application/x-msdownload"), { ok: false, reason: "unsupported_type" });
});

test("validateInboundMediaBytes accepts PDF/JPEG/PNG by exact magic bytes", () => {
  assert.equal(validateInboundMediaBytes(pdf, "application/pdf").ok, true);
  assert.equal(validateInboundMediaBytes(jpeg, "image/jpeg").ok, true);
  assert.equal(validateInboundMediaBytes(png, "image/png").ok, true);
});
