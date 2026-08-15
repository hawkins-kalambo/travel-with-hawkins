-- Marketplace Expansion, Stage 2: private storage for operator compliance
-- documents (business registration, insurance, vehicle registration,
-- driver's licenses, etc).
--
-- Unlike customer-profiles (public: true, per 2026_08_02_customer_email_otp.sql
-- — profile pictures are meant to render directly), compliance documents are
-- sensitive and must never be publicly readable by URL. Access is brokered
-- exclusively through short-lived signed URLs generated server-side with the
-- service-role key (see lib/operatorDocuments.ts), matching Master Plan
-- §7.4: "Private documents use short-lived authorised access."
--
-- Safe to run multiple times.

INSERT INTO storage.buckets (id, name, public)
VALUES ('operator-documents', 'operator-documents', false)
ON CONFLICT (id) DO NOTHING;
