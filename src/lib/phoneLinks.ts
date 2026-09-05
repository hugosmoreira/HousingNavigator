/**
 * Turn one provider contact into a dialable link without joining an extension
 * to the main number. This directory uses US/Canada numbers unless a country
 * code is explicit. Ambiguous contacts stay visible as text, never guessed.
 */
export function phoneHref(phone: string | null | undefined): string | null {
  const value = phone?.trim().replace(/^tel:/i, '');
  if (!value || value.length > 128) return null;

  const match = value.match(
    /^(\+?[\d(][\d\s().\-\u2010-\u2015]*?)(?:\s*(?:ext(?:ension)?\.?\s*:?|x|#|;ext=)\s*(\d+))?$/i,
  );
  if (!match) return null;
  const [, number, extension] = match;
  const digits = number.replace(/\D/g, '');
  let dialNumber: string;

  if (number.startsWith('+')) {
    if (!/^[1-9]\d{6,14}$/.test(digits)) return null;
    dialNumber = `+${digits}`;
  } else if (/^\d{3}$/.test(digits) && !extension) {
    // Preserve local service codes such as 211 and 988; never add +1.
    dialNumber = digits;
  } else if (/^[2-9]\d{9}$/.test(digits)) {
    dialNumber = `+1${digits}`;
  } else if (/^1[2-9]\d{9}$/.test(digits)) {
    dialNumber = `+${digits}`;
  } else {
    return null;
  }

  // RFC 3966 keeps extensions separate. The phone app decides how to dial it;
  // retain the visible extension so users can enter it manually when prompted.
  return `tel:${dialNumber}${extension ? `;ext=${extension}` : ''}`;
}
