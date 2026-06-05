function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Mapeia sexo do fluxo (1–4) para o formulário Fox (1=M, 2=F). */
export function mapSexoToFox(sexoChoice: string): {
  slcSexo: "1" | "2";
  sexoDeclarado: string;
  observacao?: string;
} {
  const v = sexoChoice.trim();
  if (v === "2" || v === "feminino") {
    return { slcSexo: "2", sexoDeclarado: "feminino" };
  }
  if (v === "3" || v === "outro") {
    return {
      slcSexo: "1",
      sexoDeclarado: "outro",
      observacao: "Sexo declarado como Outro — enviado conforme orientação Fox.",
    };
  }
  if (v === "4" || v === "nao_informado") {
    return {
      slcSexo: "2",
      sexoDeclarado: "nao_informado",
      observacao: "Participante preferiu não informar sexo.",
    };
  }
  return { slcSexo: "1", sexoDeclarado: "masculino" };
}

/** Escolaridade fluxo (1–6) → Fox slcEscolaridade (1–7). */
export function mapEscolaridadeToFox(choice: string): string {
  const map: Record<string, string> = {
    "1": "2",
    "2": "3",
    "3": "5",
    "4": "4",
    "5": "6",
    "6": "7",
  };
  return map[choice.trim()] ?? "3";
}

/** Estado civil texto ou número → Fox (1–4). */
export function mapEstadoCivilToFox(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "2" || v.includes("casad")) return "2";
  if (v === "3" || v.includes("viuv")) return "3";
  if (v === "4" || v.includes("uniao") || v.includes("união")) return "4";
  return "1";
}

/** Tipo PIX fluxo (1–5) → Fox slcChavePix. CNPJ mapeado como Chave Aleatória. */
export function mapPixTipoToFox(tipo: string): string {
  const v = tipo.trim();
  if (v === "1" || v.toLowerCase() === "cpf") return "CPF";
  if (v === "3" || v.toLowerCase() === "telefone") return "Telefone";
  if (v === "4" || v.toLowerCase() === "email") return "Email";
  if (v === "2" || v.toLowerCase() === "cnpj") return "Email";
  return "Email";
}

export function mapPixTipoLabel(tipo: string): string {
  if (tipo.trim() === "2") return "CNPJ (enviado como chave aleatória no cadastro Fox)";
  const labels: Record<string, string> = {
    "1": "CPF",
    "3": "Telefone",
    "4": "E-mail",
    "5": "Chave Aleatória",
  };
  return labels[tipo.trim()] ?? "Chave Aleatória";
}

const BANK_ALIASES: Record<string, string[]> = {
  nubank: ["nubank", "nu pagamentos"],
  itau: ["itau", "itaú", "itaú unibanco"],
  bradesco: ["bradesco"],
  caixa: ["caixa", "cef", "caixa economica"],
  santander: ["santander"],
  banco_do_brasil: ["banco do brasil", "bb"],
  inter: ["inter", "banco inter"],
  c6: ["c6", "c6 bank"],
};

/** Resolve nome livre de banco para uso no cadastro (Fox exige ID; guardamos texto + alias). */
export function normalizeBancosList(raw: string): {
  texto: string;
  skipped: boolean;
  aliases: string[];
} {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    ["pular", "nao", "não", "nao tenho", "não tenho"].some((s) =>
      trimmed.toLowerCase().includes(s)
    )
  ) {
    return { texto: "", skipped: true, aliases: [] };
  }
  const parts = trimmed.split(/[,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const aliases: string[] = [];
  for (const part of parts) {
    for (const [key, names] of Object.entries(BANK_ALIASES)) {
      if (names.some((n) => part.includes(n))) {
        aliases.push(key);
        break;
      }
    }
  }
  return { texto: trimmed, skipped: false, aliases };
}

export type FoxCadastroVariables = Record<string, unknown>;

/** Monta corpo application/x-www-form-urlencoded para cadastraPessoa.php */
export function buildFoxCadastroFormBody(
  vars: FoxCadastroVariables,
  hidChave: string,
  hidFormulario: string
): URLSearchParams {
  const sexo = mapSexoToFox(String(vars.sexo ?? "1"));
  const bancos = normalizeBancosList(String(vars.bancos_texto ?? ""));
  const pixTipo = String(vars.pix_tipo ?? "").trim();
  const pixValor = String(vars.pix_valor ?? "").trim();
  const temPix = pixTipo && pixValor && !isSkip(pixValor);

  const extraNotes: string[] = [];
  if (sexo.observacao) extraNotes.push(sexo.observacao);
  if (vars.tem_carro === "1" || vars.tem_carro === "sim") {
    extraNotes.push(
      `Veículo: ${vars.carro_marca_label ?? vars.carro_marca ?? ""} ${vars.carro_modelo ?? ""}`.trim()
    );
  }
  if (bancos.texto && !bancos.skipped) {
    extraNotes.push(`Bancos informados: ${bancos.texto}`);
  }
  if (vars.segmento_texto) {
    extraNotes.push(`Segmento declarado: ${String(vars.segmento_texto)}`);
  }
  if (Array.isArray(vars.filhos_list) && vars.filhos_list.length > 0) {
    const resumo = (vars.filhos_list as Array<Record<string, unknown>>)
      .map((filho, idx) => {
        const nome = String(filho.nome ?? "").trim();
        const nasc = String(filho.nascimento ?? "").trim();
        const sexo = String(filho.sexo ?? "").trim();
        return `${idx + 1}) ${nome} — ${nasc} — sexo ${sexo}`;
      })
      .join(" | ");
    extraNotes.push(`Filhos cadastrados: ${resumo}`);
  }
  if (pixTipo === "2") {
    extraNotes.push(`PIX CNPJ informado: ${pixValor}`);
  }

  const params = new URLSearchParams();
  params.set("hidChave", hidChave);
  params.set("hidFormulario", hidFormulario);
  params.set("txtNomeCompleto", String(vars.nome_completo ?? ""));
  params.set("txtCpf", String(vars.cpf ?? ""));
  params.set("txtDataNascimento", String(vars.data_nascimento ?? ""));
  params.set("slcSexo", sexo.slcSexo);
  params.set("slcEscolaridade", mapEscolaridadeToFox(String(vars.escolaridade ?? "2")));
  params.set("slcEstadoCivil", mapEstadoCivilToFox(String(vars.estado_civil ?? "1")));
  params.set("txtCelular", String(vars.celular ?? ""));
  params.set("txtWhatsApp", String(vars.celular ?? ""));
  params.set("txtEmailPessoal", String(vars.email_pessoal ?? ""));
  params.set("txtEmailComercial", String(vars.email_comercial ?? ""));
  params.set("txtCep", String(vars.cep ?? ""));
  params.set("txtRua", String(vars.logradouro ?? "Não informado"));
  params.set("txtNumero", String(vars.numero ?? "S/N"));
  params.set(
    "txtComplemento",
    [String(vars.complemento ?? ""), extraNotes.length ? `Obs: ${extraNotes.join(" | ")}` : ""]
      .filter(Boolean)
      .join(" ")
      .trim() || "Não informado"
  );
  params.set("txtBairro", String(vars.bairro ?? "Não informado"));
  params.set("slcZoneamento", String(vars.zona_sp ?? "1"));
  params.set("txtNomeEmpresa", String(vars.empresa ?? ""));
  params.set("txtCargo", String(vars.cargo ?? ""));
  params.set("txtRendaFamiliar", String(vars.renda_familiar ?? ""));
  params.set("txtFacebook", String(vars.facebook ?? ""));
  params.set("txtInstagram", String(vars.instagram ?? ""));
  params.set("txtLinkedIn", String(vars.linkedin ?? ""));

  if (temPix) {
    params.set("slcChavePix", mapPixTipoToFox(pixTipo));
    params.set("txtTextoChavePix", pixValor);
  }

  params.set("fox_meta_carro", JSON.stringify({
    tem_carro: vars.tem_carro ?? null,
    marca: vars.carro_marca ?? null,
    modelo: vars.carro_modelo ?? null,
  }));
  params.set("fox_meta_sexo_declarado", sexo.sexoDeclarado);
  params.set("fox_meta_bancos_aliases", JSON.stringify(bancos.aliases));

  return params;
}

function isSkip(value: string): boolean {
  const v = value.trim().toLowerCase();
  return !v || v === "pular" || v.includes("nao tenho") || v.includes("não tenho");
}

export function buildFoxFilhoPayload(vars: FoxCadastroVariables): {
  nome: string;
  nascimento: string;
  sexo: string;
  cpf: string;
} | null {
  if (vars.tem_filhos !== "1" && vars.tem_filhos !== "sim") return null;
  const nome = String(vars.filho_nome ?? "").trim();
  const nascimento = String(vars.filho_nascimento ?? "").trim();
  const sexo = String(vars.filho_sexo ?? "1");
  const cpf = String(vars.cpf ?? "");
  if (!nome || !nascimento) return null;
  return { nome, nascimento, sexo, cpf: onlyDigits(cpf) };
}
