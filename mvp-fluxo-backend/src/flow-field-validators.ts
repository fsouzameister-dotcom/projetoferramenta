export type FlowFieldValidationType =
  | "text"
  | "full_name"
  | "date_br"
  | "cpf"
  | "email"
  | "email_or_skip"
  | "phone_br"
  | "cep"
  | "uf"
  | "money_br"
  | "skip_or_text";

export type FlowFieldValidationOptions = {
  min?: number;
  max?: number;
  choices?: number[];
  skipLiterals?: string[];
};

export type FlowFieldValidationResult =
  | { ok: true; normalized: string; rawAccepted?: string }
  | { ok: false; reason: string };

const SKIP_DEFAULTS = [
  "pular",
  "nao tenho",
  "não tenho",
  "nao possuo",
  "não possuo",
  "prefiro nao informar",
  "prefiro não informar",
  "sem",
  "n/a",
];

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function isSkipLiteral(raw: string, extras: string[] = []): boolean {
  const norm = stripDiacritics(raw.trim().toLowerCase());
  return [...SKIP_DEFAULTS, ...extras].some(
    (s) => stripDiacritics(s.toLowerCase()) === norm
  );
}

function isValidCpfDigits(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += Number(digits[i]) * (slice + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

export function formatCpf(digits: string): string {
  const d = onlyDigits(digits).slice(0, 11);
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatPhoneBr(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return digits;
}

export function formatCep(digits: string): string {
  const d = onlyDigits(digits).slice(0, 8);
  if (d.length !== 8) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function parseDateBrToIso(raw: string): string | null {
  const trimmed = raw.trim();
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;
  return null;
}

export function validateFlowField(
  type: FlowFieldValidationType,
  raw: string,
  options: FlowFieldValidationOptions = {}
): FlowFieldValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "Resposta vazia. Por favor, envie a informação solicitada." };
  }

  switch (type) {
    case "text":
      return { ok: true, normalized: trimmed };

    case "full_name": {
      const parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        return {
          ok: false,
          reason: "Informe seu nome completo (nome e sobrenome).",
        };
      }
      return { ok: true, normalized: parts.join(" ") };
    }

    case "date_br": {
      const iso = parseDateBrToIso(trimmed);
      if (!iso) {
        return {
          ok: false,
          reason: "Data inválida. Use o formato DD/MM/AAAA (ex.: 15/03/1990).",
        };
      }
      return { ok: true, normalized: iso, rawAccepted: trimmed };
    }

    case "cpf": {
      const digits = onlyDigits(trimmed);
      if (!isValidCpfDigits(digits)) {
        return {
          ok: false,
          reason: "CPF inválido. Informe no formato XXX.XXX.XXX-XX.",
        };
      }
      return { ok: true, normalized: formatCpf(digits) };
    }

    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return {
          ok: false,
          reason: "E-mail inválido. Exemplo: seuemail@email.com.br",
        };
      }
      return { ok: true, normalized: trimmed.toLowerCase() };
    }

    case "email_or_skip": {
      if (isSkipLiteral(trimmed, options.skipLiterals)) {
        return { ok: true, normalized: "", rawAccepted: trimmed };
      }
      return validateFlowField("email", trimmed, options);
    }

    case "phone_br": {
      const digits = onlyDigits(trimmed);
      if (digits.length < 10 || digits.length > 11) {
        return {
          ok: false,
          reason: "Telefone inválido. Use o formato (XX) XXXXX-XXXX com DDD.",
        };
      }
      return { ok: true, normalized: formatPhoneBr(digits) };
    }

    case "cep": {
      const digits = onlyDigits(trimmed);
      if (digits.length !== 8) {
        return {
          ok: false,
          reason: "CEP inválido. Use o formato XXXXX-XXX.",
        };
      }
      return { ok: true, normalized: formatCep(digits) };
    }

    case "uf": {
      const uf = stripDiacritics(trimmed).toUpperCase().replace(/[^A-Z]/g, "");
      if (uf.length !== 2) {
        return {
          ok: false,
          reason: "UF inválida. Informe 2 letras, ex.: SP, RJ, MG.",
        };
      }
      return { ok: true, normalized: uf };
    }

    case "money_br": {
      const digits = onlyDigits(trimmed);
      if (!digits) {
        return {
          ok: false,
          reason: "Valor inválido. Exemplo: R$ 3500,00 ou 3500.",
        };
      }
      const cents = Number(digits);
      const formatted = `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
      return { ok: true, normalized: formatted };
    }

    case "skip_or_text": {
      if (isSkipLiteral(trimmed, options.skipLiterals)) {
        return { ok: true, normalized: "", rawAccepted: trimmed };
      }
      return { ok: true, normalized: trimmed };
    }

    default:
      return { ok: true, normalized: trimmed };
  }
}

export function normalizeInboundTrigger(text: string): string {
  return stripDiacritics(text.trim().toLowerCase()).replace(/\s+/g, " ");
}

function compactTriggerToken(text: string): string {
  return normalizeInboundTrigger(text).replace(/[-\s]+/g, "");
}

export function matchesInboundTrigger(messageText: string, triggers: string[]): boolean {
  const norm = normalizeInboundTrigger(messageText);
  const compact = compactTriggerToken(messageText);
  return triggers.some((t) => {
    const trigger = normalizeInboundTrigger(t);
    const triggerCompact = compactTriggerToken(t);
    return (
      norm === trigger ||
      norm.includes(trigger) ||
      compact === triggerCompact ||
      compact.includes(triggerCompact)
    );
  });
}
