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

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateBrToIso(raw: string): string | null {
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return toIsoDate(year, month, day);
  }

  const br = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return toIsoDate(year, month, day);
  }

  const compact = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) {
    const day = Number(compact[1]);
    const month = Number(compact[2]);
    const year = Number(compact[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return toIsoDate(year, month, day);
  }

  return null;
}

export function parsePhoneBrDigits(raw: string): string | null {
  let digits = onlyDigits(raw);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 || digits.length === 11) {
    return digits;
  }
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
          reason:
            "Data inválida. Ex.: 15/03/1990, 15-03-1990, 15031990 ou 1990-03-15.",
        };
      }
      return { ok: true, normalized: iso, rawAccepted: trimmed };
    }

    case "cpf": {
      const digits = onlyDigits(trimmed);
      if (digits.length !== 11) {
        return {
          ok: false,
          reason:
            "CPF inválido. Informe 11 dígitos ou use o formato XXX.XXX.XXX-XX.",
        };
      }
      if (!isValidCpfDigits(digits)) {
        return {
          ok: false,
          reason: "CPF inválido. Verifique os números informados.",
        };
      }
      return { ok: true, normalized: formatCpf(digits), rawAccepted: trimmed };
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
      const digits = parsePhoneBrDigits(trimmed);
      if (!digits) {
        return {
          ok: false,
          reason:
            "Telefone inválido. Ex.: (11) 99999-8888, 11999998888 ou +55 11 99999-8888.",
        };
      }
      return { ok: true, normalized: formatPhoneBr(digits), rawAccepted: trimmed };
    }

    case "cep": {
      if (!/^\d{5}-\d{3}$/.test(trimmed)) {
        return {
          ok: false,
          reason: "CEP inválido. Use o formato XXXXX-XXX.",
        };
      }
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
      let amount = trimmed;
      if (/^R\$/i.test(amount)) {
        amount = amount.replace(/^R\$\s*/i, "").trim();
      } else if (!/^\d/.test(amount)) {
        return {
          ok: false,
          reason:
            "Valor inválido. Use o formato R$ 3.500,00, R$ 7000,00 ou apenas 5000.",
        };
      }

      const commaIdx = amount.lastIndexOf(",");
      let wholePart: string;
      let centPart = "00";
      if (commaIdx >= 0) {
        wholePart = amount.slice(0, commaIdx).replace(/\./g, "").trim();
        centPart = amount.slice(commaIdx + 1).replace(/\D/g, "");
      } else {
        wholePart = amount.replace(/\./g, "").trim();
      }

      if (!/^\d+$/.test(wholePart) || wholePart.length === 0) {
        return {
          ok: false,
          reason:
            "Valor inválido. Use o formato R$ 3.500,00, R$ 7000,00 ou apenas 5000.",
        };
      }
      if (centPart.length > 0 && centPart.length !== 2) {
        return {
          ok: false,
          reason:
            "Valor inválido. Use o formato R$ 3.500,00, R$ 7000,00 ou apenas 5000.",
        };
      }

      const formatted = `R$ ${Number(wholePart).toLocaleString("pt-BR")},${centPart.padStart(2, "0")}`;
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

const CADASTRO_POSITIVE_COMPACT = new Set(["cadastrar", "cadastrarse"]);

export function valuesMatchForFlowDecision(left: unknown, right: unknown): boolean {
  const leftStr = String(left ?? "");
  const rightStr = String(right ?? "");
  if (leftStr === rightStr) return true;

  const normL = normalizeInboundTrigger(leftStr);
  const normR = normalizeInboundTrigger(rightStr);
  if (normL === normR) return true;

  const compactL = compactTriggerToken(leftStr);
  const compactR = compactTriggerToken(rightStr);
  if (compactL === compactR) return true;

  if (rightStr === "cadastrar-se") {
    return CADASTRO_POSITIVE_COMPACT.has(compactL) || compactL.includes("cadastrar");
  }
  if (rightStr === "agora-nao") {
    return compactL === "agoranao" || normL === "agora nao" || normL.startsWith("agora nao ");
  }

  return compactL.includes(compactR) || compactR.includes(compactL);
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
