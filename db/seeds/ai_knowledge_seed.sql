-- Starter set for the AI Assistant approved-knowledge base (Phase A2).
-- POLICY / how-it-works answers only — nothing dynamic (fares, schedules, a
-- customer's booking), which the assistant must fetch live.
--
-- Idempotent: a row is inserted only if no active/inactive row already has the
-- same (topic, language). Re-running adds nothing. Review the wording against
-- your live policy before running. The Chichewa rows are inserted inactive +
-- requires_review; activate them from Admin -> AI Knowledge after a fluent check.

WITH seed(topic, category, example_questions, approved_answer, language, keywords, is_active, priority, requires_review) AS (
  VALUES
  ('How to make a booking', 'booking',
   E'how do I book\nhow to make a booking\ncan I book a seat',
   'Choose Make a Booking from the menu, pick your route, choose a travel date, enter the passenger details, review the summary, then confirm. Payment of the booking fee holds the seat.',
   'en', 'book booking make reserve seat how', true, 20, false),

  ('Booking fee vs transport fare', 'booking_fee',
   E'is the booking fee the fare\nwhat is the booking fee\ndo I pay the full amount now',
   'The booking fee is a small amount paid online to hold your seat. It is separate from the transport fare unless your booking says otherwise. The fare is settled with the operator per your booking.',
   'en', 'booking fee fare separate deposit hold seat', true, 20, false),

  ('When the booking fee is due', 'booking_fee',
   E'when do I pay the booking fee\nhow long do I have to pay\npayment deadline',
   'If your trip is 7 or more days away the booking fee is due within 7 days. If the trip is sooner, the fee is due immediately and the seat is held only briefly. An unpaid seat is released when its deadline passes.',
   'en', 'deadline due pay booking fee 7 days when hold release', true, 20, false),

  ('Paying safely', 'payment',
   E'is it safe to pay\nhow do I pay\nwhere do I pay',
   'Payment is only ever taken on the secure PayChangu checkout page. Travel With Hawkins never asks for a card number, mobile-money PIN, password or one-time code in this chat.',
   'en', 'pay payment safe secure paychangu pin card scam', true, 15, false),

  ('Cancellations and refunds', 'cancellation',
   E'can I cancel\nhow do refunds work\nI want my money back',
   'Cancellations and refunds are handled case by case and can depend on timing, the operator and how you paid. Choose Talk to an Agent and share your booking reference so the team can help.',
   'en', 'cancel cancellation refund money back change mind', true, 30, false),

  ('Changing a booking', 'cancellation',
   E'can I change my travel date\nchange the route\nadd another passenger to my booking',
   'To change a date, route or passenger on an existing booking, contact our team with the booking reference as early as possible. Changes depend on availability and the operator. Each passenger is a separate booking with its own reference.',
   'en', 'change reschedule date route passenger amend booking', true, 30, false),

  ('Luggage', 'luggage',
   E'how much luggage can I bring\nbaggage allowance\ncan I bring two bags',
   'Bring a reasonable amount of personal luggage. Oversized items or extra bags are at the operator''s discretion and may carry a charge. Keep valuables and documents with you.',
   'en', 'luggage baggage bags allowance suitcase katundu', true, 40, false),

  ('One passenger per booking', 'booking',
   E'can I book for my friend too\nbook two people\ngroup booking',
   'Each booking is for one passenger and one seat, with its own booking reference. To travel with others, make a separate booking for each passenger from the same number using Book Another Passenger.',
   'en', 'group multiple passengers friend family together booking', true, 30, false),

  ('Reserving before a trip is scheduled', 'booking',
   E'there is no bus on my date\nno trip for that day\ncan I still book',
   'Yes. If no trip has been scheduled for your date yet, you can still make a reservation. Your place is held under the payment deadline and we notify you once the trip details are confirmed.',
   'en', 'no trip scheduled date reserve reservation notify confirm', true, 25, false),

  ('Student travel', 'student_travel',
   E'do you go to MZUNI\nstudent bus to university\ntravelling to campus',
   'We run student travel between home districts and active universities, in both directions. Choose Student Travel, then whether you are going to university or heading home.',
   'en', 'student university campus mzuni luanar going home to university', true, 25, false),

  ('Talking to a person', 'support',
   E'I want to talk to someone\nagent\nspeak to a human',
   'Choose Talk to an Agent from the menu. Your request goes to our support team and you can keep using the bot while you wait. You can also email contact@travelwithhawkins.com.',
   'en', 'agent human support help contact talk person', true, 20, false),

  ('Receipts', 'payment',
   E'where is my receipt\nsend me a receipt\nproof of payment',
   'A receipt is issued once your booking fee is confirmed. If your fee is paid and you have not received it, ask our team with your booking reference.',
   'en', 'receipt proof payment confirmation invoice', true, 35, false),

  ('Pickup point and boarding time', 'pickup',
   E'where do I board\npickup point\nwhat time do I catch the bus',
   'Your route''s pickup point is shown when you book. The exact boarding time is confirmed once a trip is assigned to your date — we notify you then.',
   'en', 'pickup point board boarding time where catch bus stop', true, 30, false),

  ('Momwe mungabuke', 'booking',
   E'ndingabuke bwanji\nkodi ndingabuke seat',
   'Sankhani Pangani Booking pa menu, sankhani njira yanu, sankhani tsiku la ulendo, lembani zambiri za woyenda, onani chidule, ndiye tsimikizani. Kulipira booking fee kumasunga mpando.',
   'ny', 'buka booking pangani mpando ulendo', false, 20, true),

  ('Booking fee ndi mtengo wa ulendo', 'booking_fee',
   E'kodi booking fee ndi mtengo wa ulendo\nndilipira zonse tsopano',
   'Booking fee ndi ndalama zochepa zolipira pa intaneti kuti musunge mpando. Ndi yosiyana ndi mtengo wa ulendo pokhapokha booking yanu itanena mosiyana.',
   'ny', 'booking fee mtengo ulendo yosiyana deposit', false, 20, true)
)
INSERT INTO public.ai_knowledge
  (topic, category, example_questions, approved_answer, language, keywords, is_active, priority, requires_live_data, requires_review, version)
SELECT s.topic, s.category, s.example_questions, s.approved_answer, s.language, s.keywords,
       s.is_active, s.priority, false, s.requires_review, 1
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_knowledge k
  WHERE k.topic = s.topic AND k.language = s.language
);
