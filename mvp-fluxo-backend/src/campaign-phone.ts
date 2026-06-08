export function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizeCampaignPhoneE164(raw: string): string | null {
  let digits = phoneDigitsOnly(raw);
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  if (digits.length >= 12) {
    return `+${digits}`;
  }
  return null;
}
