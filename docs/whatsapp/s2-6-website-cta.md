# WhatsApp — public website CTA points at the official bot number (Phase H)

Every public `wa.me` call-to-action now resolves through **one canonical link
builder** aimed at the official Travel With Hawkins bot number, instead of the
hardcoded old/unrelated number (`265989127308`).

No migration. No server code. One optional env var.

## Audit — every WhatsApp CTA on the public site

| Location | Before | After |
| --- | --- | --- |
| `app/components/WhatsAppButton.tsx` — floating button (home, about, routes, trips, contact, terms, privacy, apply, payment/return) | `wa.me/265989127308` literal | `buildWhatsAppLink("Hello Travel With Hawkins, I would like to book transport")` |
| `app/components/home/SiteFooter.tsx` — footer WhatsApp tile | imported `whatsappUrl` | unchanged import — now the bot link |
| `app/contact/page.tsx` — "Chat with us on WhatsApp" button | imported `whatsappUrl` | unchanged import — now the bot link |
| `app/layout.tsx` — Organization JSON-LD `ContactPoint` | `url: wa.me/265989127308`, `telephone: +265989127308` | `buildWhatsAppLink("")`, `whatsAppBotNumberDisplay()` |
| `app/ambassador/apply/page.tsx` — submitted-page "Chat on WhatsApp" | `wa.me/265989127308` literal | `buildWhatsAppLink()` |
| `app/admin/page.tsx` — broadcast-message builder (admin tool, not public) | `+265989127308` / `wa.me/265989127308` literals | `whatsAppBotNumberDisplay()` / `buildWhatsAppLink("")` |

Left alone (out of scope — voice lines, or per-customer links):
`tel:` numbers in the footer / apply page / layout `telephone` arrays, and
`app/admin/page.tsx:2175` (`wa.me/<the selected student's phone>`).

## `lib/whatsappLink.ts` (new, public-safe — no `server-only`)

- `whatsAppBotNumber()` → digits-only number. Reads
  **`NEXT_PUBLIC_WHATSAPP_BOT_NUMBER`** (build-time inlined, not a secret);
  falls back to `265890845383` (the number from the implementation brief).
- `whatsAppBotNumberDisplay()` → `+265 890 84 53 83`.
- `buildWhatsAppLink(prefill = "Hi Travel With Hawkins")` →
  `https://wa.me/<number>?text=<encoded, ≤300 chars>`. The short prefill lets
  the inbound webhook fire so the bot sends its welcome + menu. **Never**
  carries a token, phone-number ID or WABA ID.

`app/components/WhatsAppButton.tsx` still exports `whatsappUrl` (now the builder
output) so `SiteFooter` and `contact` stay in sync with no change. Button
markup, `aria-label`, `target="_blank" rel="noopener noreferrer"` and the
focus ring are unchanged.

## Before deploy — confirm the number

`265890845383` is taken from the brief. If production's official bot number
differs, set `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` in Vercel (Production) to the
correct digits-only value — no code change. Then click the floating button and
the footer tile on desktop and mobile and confirm they open the correct
WhatsApp Business conversation with the prefilled greeting.

## Env (name only, optional)

| Var | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` | `265890845383` | public wa.me destination for every site CTA (digits only). |

## Tests

`lib/whatsappLink.test.ts` — fallback number + display format, env override with
non-digit stripping, `wa.me` URL shape, encoded / empty / truncated prefill, and
that the URL carries nothing but the number and greeting.

`npm run test` (97), `npm run typecheck`, lint, `next build` — all green.
