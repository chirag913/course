// Manual-only WhatsApp helper — Phase J (MVP/onboarding pass). Builds a
// wa.me deep link the admin opens and reviews themselves; there is no
// WhatsApp Business API integration, no automatic sending, and no message
// ever leaves this app without the admin pressing Send inside WhatsApp.

// wa.me requires digits only (country code + number, no leading +, spaces,
// or punctuation). Returns null when nothing usable remains, so callers can
// render a clear "no number on file" state instead of a broken link.
export function sanitizePhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 8 ? digits : null;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message?: string): string | null {
  const digits = sanitizePhoneForWhatsApp(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
