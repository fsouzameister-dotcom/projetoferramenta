/** Extrai nome e telefone de um vCard (contato compartilhado no WhatsApp). */
export function parseVcardContact(buffer: Buffer): { name: string; phone: string } | null {
  const text = buffer.toString("utf8");
  const fn = text.match(/^FN:(.+)$/im)?.[1]?.trim();
  const tel =
    text.match(/^TEL[^:]*:(.+)$/im)?.[1]?.trim() ||
    text.match(/^item\d+\.TEL[^:]*:(.+)$/im)?.[1]?.trim();
  if (!tel) return null;
  return {
    name: fn || "Contato",
    phone: tel,
  };
}

export function isVcardMimeType(mimeType?: string): boolean {
  const m = (mimeType ?? "").toLowerCase();
  return m.includes("vcard") || m.includes("x-vcard") || m === "text/directory";
}
