# Website Chat — safe Groq assistance behind the FAQ layer (Phase I)

The homepage chat widget now falls back to the **same server-side AI provider
the WhatsApp bot uses** when its deterministic FAQ layer can't place a message —
instead of always replying "I don't have specifics on that yet."

No migration. No new AI client, no new env var. Disabled by default (the shared
provider returns `null` while `WHATSAPP_AI_PROVIDER` is blank).

## Where it sits

`lib/websiteChat/respond.ts` → `respondToGuestMessage`:

1. `mode === "human"` → stay silent (unchanged).
2. `wantsHuman(text)` → hand off to a human (unchanged).
3. `answerFromApprovedKnowledge(text)`:
   - **answered** → send that FAQ answer. **The model is not called.**
   - **unsafe** (prompt-injection regex hit) → hard stop, canned reply.
     **Never forwarded to the model.**
   - **unknown / unrelated** → ask `getWhatsAppAiProvider()?.interpret(text, "en")`:
     - `ai.answer` present → send it (the provider constrains answers to
       `APPROVED_BUSINESS_FACTS`, ≤ 300 chars, and drops anything that looks
       like a price/number).
     - `ai.intent === "agent"` → hand off.
     - `ai.intent` `routes` / `booking` → the "book from the homepage" hint.
     - `ai.intent` `tracking` / `payment` → "log in and open your dashboard"
       hint — **it never looks up a live status.**
     - anything else / `clarify` / no provider / AI error → the existing safe
       fallback.

## Guardrails (inherited from the shared provider — `lib/whatsapp/ai-provider.ts`)

- Server-side only; key never reaches the browser.
- Bounded: 6 s timeout, 400-char input cap, 200 max tokens, `temperature: 0`,
  `response_format: json_object`. Any error (401 / 404 / 429 / timeout /
  malformed) → `SAFE_DEFAULT`, the widget stays responsive.
- **Only the guest's message text** is sent — no booking, payment, customer or
  account data.
- Prompt injection: the `INJECTION` regex in `websiteChat/knowledge.ts` catches
  the obvious cases as `unsafe` before the AI is reached; the system prompt
  additionally treats the user message as data, never instructions.
- Answers come from the **same** `APPROVED_BUSINESS_FACTS` the WhatsApp bot
  uses, so the two channels don't contradict each other on static info.
- The model never books, pays, verifies, or invents a fare / seat / schedule /
  status — it only picks which existing action to point the visitor at.

The widget's opening line already discloses "I'm the Travel with Hawkins
assistant".

## Tests

`lib/websiteChat/respond.test.ts` (new, 9 cases) — FAQ answered → model not
called; injection → hard stop; `wantsHuman` → handoff; AI disabled → safe
fallback; AI `answer` used; `intent: booking` → hint; `intent: tracking` → no
lookup; `intent: agent` → handoff; AI throw → safe fallback, no crash.

`npm run test` (106), full `tsc`, lint, `next build` — all green.

## Not changed

The deterministic FAQ answers in `websiteChat/knowledge.ts` (their own approved
site copy) and the widget UI / quick actions.
