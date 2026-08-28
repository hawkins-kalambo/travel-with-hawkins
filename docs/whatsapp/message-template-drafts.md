# WhatsApp message-template drafts

These drafts are for later legal/operations review and Meta submission. They
have not been submitted or approved. Chichewa drafts require fluent human
review. Template parameters are positional and must contain non-sensitive data.

| Internal draft name | Purpose | English draft | Chichewa draft (review required) |
|---|---|---|---|
| `booking_created` | Booking created | “Your Travel With Hawkins booking {{1}} has been created for {{2}}. Pay the booking fee using the secure link: {{3}}.” | “Booking yanu ya Travel With Hawkins {{1}} yapangidwa ya {{2}}. Lipirani booking fee pa link yotetezeka iyi: {{3}}.” |
| `booking_fee_payment_requested` | Fee requested | “Booking {{1}} is awaiting a booking-fee payment of MWK {{2}}. Use this secure PayChangu link: {{3}}. Never share your PIN.” | “Booking {{1}} ikuyembekezera booking fee ya MWK {{2}}. Gwiritsani ntchito link ya PayChangu iyi: {{3}}. Musauze munthu PIN yanu.” |
| `payment_confirmed` | Payment confirmation | “Payment confirmed for booking {{1}}: your {{2}} has been paid.” | “Payment ya booking {{1}} yatsimikizidwa: {{2}} yalipidwa.” |
| `trip_reminder` | Reminder | “Reminder: booking {{1}} travels on {{2}}. Pickup: {{3}}. Reply AGENT if you need help.” | “Chikumbutso: booking {{1}} iyenda pa {{2}}. Pickup: {{3}}. Yankhani AGENT ngati mukufuna thandizo.” |
| `booking_status_update` | Journey update | “Booking {{1}} status is now {{2}}. Travel date: {{3}}.” | “Status ya booking {{1}} tsopano ndi {{2}}. Tsiku la ulendo: {{3}}.” |
| `human_agent_follow_up` | Agent follow-up | “Travel With Hawkins support is following up about conversation {{1}}. Reply to continue.” | “Support ya Travel With Hawkins ikukutsatirani pa conversation {{1}}. Yankhani kuti mupitirize.” |

Before submission, confirm Meta category, language code, parameter examples,
opt-out wording, and whether URLs require URL-button components rather than body
parameters. Add a name to `WHATSAPP_APPROVED_TEMPLATE_NAMES` only after approval.

