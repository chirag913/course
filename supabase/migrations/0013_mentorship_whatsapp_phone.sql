-- Phase J (MVP/onboarding pass) — admin needs a stored contact number to
-- open WhatsApp manually for a student. No provider dependency: this is
-- purely a text field the admin fills in and a wa.me link the admin opens
-- and sends themselves.
--
-- Added to mentorship_profiles (not the shared profiles table) since this
-- is a mentorship-specific contact channel, not a general account field —
-- course-only students never need it.

ALTER TABLE public.mentorship_profiles
  ADD COLUMN whatsapp_phone text;

COMMENT ON COLUMN public.mentorship_profiles.whatsapp_phone IS
  'Student''s WhatsApp-reachable phone number, admin-entered. Used only to build a wa.me link for the admin to open and send manually — never sent to any third-party API.';
