import assert from "node:assert/strict";
import test from "node:test";
import { maskPhoneNumber, normalizeMalawiPhone } from "./phoneNumbers.ts";

test("normalizes supported Malawi mobile formats to E.164", () => {
  const cases = [
    ["0991234567", "+265991234567"],
    ["0881234567", "+265881234567"],
    ["265991234567", "+265991234567"],
    ["+265991234567", "+265991234567"],
    ["(099) 123-4567", "+265991234567"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeMalawiPhone(input), expected);
  }
});

test("rejects invalid lengths, prefixes, characters, and duplicated country codes", () => {
  const invalid = [
    "",
    "0712345678",
    "991234567",
    "099123456",
    "09912345678",
    "+2650991234567",
    "+265265991234567",
    "+26599123/4567",
    "+254711123456",
    991234567,
  ];

  for (const input of invalid) {
    assert.equal(normalizeMalawiPhone(input), undefined);
  }
});

test("masks phone numbers in diagnostic logs", () => {
  assert.equal(maskPhoneNumber("+265991234567"), "+265******567");
  assert.equal(maskPhoneNumber("123"), "[redacted]");
});
