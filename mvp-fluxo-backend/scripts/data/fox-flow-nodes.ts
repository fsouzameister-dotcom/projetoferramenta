/** Nodes do Fluxo Fox Pesquisas — cadastro painelista via WhatsApp. */

export const FOX_HID_CHAVE = "1671438126a22f39582f7c";

export const FOX_IDS = {
  inicio: "b2000001-0001-4001-8001-000000000001",
  msg_abertura: "b2000002-0001-4002-8001-000000000002",
  cap_cadastrar: "b2000003-0001-4003-8001-000000000003",
  dec_cadastrar_sim: "b2000006-0001-4006-8001-000000000006",
  msg_nao: "b2000004-0001-4004-8001-000000000004",
  enc_nao: "b2000005-0001-4005-8001-000000000005",
  recv_nome: "b2000010-0001-4010-8001-000000000010",
  recv_nasc: "b2000011-0001-4011-8001-000000000011",
  recv_cpf: "b2000012-0001-4012-8001-000000000012",
  cap_sexo: "b2000013-0001-4013-8001-000000000013",
  cap_estado_civil: "b2000014-0001-4014-8001-000000000014",
  cap_escolaridade: "b2000015-0001-4015-8001-000000000015",
  recv_celular: "b2000016-0001-4016-8001-000000000016",
  recv_email: "b2000017-0001-4017-8001-000000000017",
  recv_email_com: "b2000018-0001-4018-8001-000000000018",
  recv_cep: "b2000019-0001-4019-8001-000000000019",
  recv_numero: "b200001a-0001-401a-8001-00000000001a",
  recv_cidade: "b200001b-0001-401b-8001-00000000001b",
  recv_uf: "b200001c-0001-401c-8001-00000000001c",
  cap_filhos: "b200001d-0001-401d-8001-00000000001d",
  dec_filhos: "b200001e-0001-401e-8001-00000000001e",
  recv_filho_nome: "b2000036-0001-4036-8001-000000000036",
  recv_filho_nasc: "b200001f-0001-401f-8001-00000000001f",
  cap_filho_sexo: "b2000020-0001-4020-8001-000000000020",
  cap_carro: "b2000021-0001-4021-8001-000000000021",
  dec_carro: "b2000022-0001-4022-8001-000000000022",
  cap_marca: "b2000023-0001-4023-8001-000000000023",
  dec_marca_outros: "b2000024-0001-4024-8001-000000000024",
  recv_marca_outros: "b2000025-0001-4025-8001-000000000025",
  recv_modelo: "b2000026-0001-4026-8001-000000000026",
  recv_empresa: "b2000027-0001-4027-8001-000000000027",
  recv_segmento: "b2000028-0001-4028-8001-000000000028",
  recv_cargo: "b2000029-0001-4029-8001-000000000029",
  recv_renda: "b200002a-0001-402a-8001-00000000002a",
  recv_facebook: "b200002b-0001-402b-8001-00000000002b",
  recv_instagram: "b200002c-0001-402c-8001-00000000002c",
  recv_linkedin: "b200002d-0001-402d-8001-00000000002d",
  recv_bancos: "b200002e-0001-402e-8001-00000000002e",
  cap_pix_quer: "b200002f-0001-402f-8001-00000000002f",
  dec_pix: "b2000030-0001-4030-8001-000000000030",
  cap_pix_tipo: "b2000031-0001-4031-8001-000000000031",
  recv_pix_valor: "b2000032-0001-4032-8001-000000000032",
  api_fox: "b2000033-0001-4033-8001-000000000033",
  msg_fim: "b2000034-0001-4034-8001-000000000034",
  enc_fim: "b2000035-0001-4035-8001-000000000035",
  msg_nome: "b2000040-0001-4040-8001-000000000040",
  msg_nasc: "b2000041-0001-4041-8001-000000000041",
  msg_cpf: "b2000042-0001-4042-8001-000000000042",
  msg_celular: "b2000043-0001-4043-8001-000000000043",
  msg_email: "b2000044-0001-4044-8001-000000000044",
  msg_email_com: "b2000045-0001-4045-8001-000000000045",
  msg_cep: "b2000046-0001-4046-8001-000000000046",
  msg_numero: "b2000047-0001-4047-8001-000000000047",
  msg_cidade: "b2000048-0001-4048-8001-000000000048",
  msg_uf: "b2000049-0001-4049-8001-000000000049",
  msg_filho_nome: "b200004a-0001-404a-8001-00000000004a",
  msg_filho_nasc: "b200004b-0001-404b-8001-00000000004b",
  msg_marca_outros: "b200004c-0001-404c-8001-00000000004c",
  msg_modelo: "b200004d-0001-404d-8001-00000000004d",
  msg_empresa: "b200004e-0001-404e-8001-00000000004e",
  msg_segmento: "b200004f-0001-404f-8001-00000000004f",
  msg_cargo: "b2000050-0001-4050-8001-000000000050",
  msg_renda: "b2000051-0001-4051-8001-000000000051",
  msg_facebook: "b2000052-0001-4052-8001-000000000052",
  msg_instagram: "b2000053-0001-4053-8001-000000000053",
  msg_linkedin: "b2000054-0001-4054-8001-000000000054",
  msg_bancos: "b2000055-0001-4055-8001-000000000055",
  msg_pix_valor: "b2000056-0001-4056-8001-000000000056",
  cap_qtd_filhos: "b2000057-0001-4057-8001-000000000057",
  contador_filho: "b2000058-0001-4058-8001-000000000058",
} as const;

function pos(x: number, y: number) {
  return { ui: { position: { x, y } } };
}

function msg(id: string, name: string, text: string, next: string, x: number, y: number) {
  return {
    id,
    type: "mensagem",
    name,
    is_start: false,
    config: { ...pos(x, y), content: text, next_node_id: next },
  };
}

function recv(
  id: string,
  name: string,
  hint: string,
  variableName: string,
  next: string,
  x: number,
  y: number,
  extra?: Record<string, unknown>
) {
  return {
    id,
    type: "receber_mensagem",
    name,
    is_start: false,
    config: {
      ...pos(x, y),
      wait_hint: hint,
      variableName,
      prompt_key: variableName,
      next_node_id: next,
      ...extra,
    },
  };
}

/** Mensagem explícita + receber resposta (evita pergunta só no wait_hint). */
function ask(
  msgId: string,
  recvId: string,
  name: string,
  question: string,
  variableName: string,
  nextAfterAnswer: string,
  x: number,
  y: number,
  extra?: Record<string, unknown>
) {
  const retry =
    (typeof extra?.invalid_prompt === "string" && extra.invalid_prompt) ||
    `Não entendi. ${question.split("\n")[0]}`;
  return [
    msg(msgId, name, question, recvId, x, y),
    recv(recvId, `${name} — resposta`, "", variableName, nextAfterAnswer, x, y + 72, {
      ...extra,
      invalid_prompt: retry,
    }),
  ];
}

function cap(
  id: string,
  name: string,
  prompt: string,
  variableName: string,
  options: Array<{ id: string; label: string }>,
  next: string,
  x: number,
  y: number,
  invalidPrompt?: string
) {
  return {
    id,
    type: "capturar_entrada",
    name,
    is_start: false,
    config: {
      ...pos(x, y),
      prompt,
      inputMode: "single_choice",
      variableName,
      prompt_key: variableName,
      options,
      next_node_id: next,
      append_options_list: false,
      invalid_prompt:
        invalidPrompt ||
        "Não entendi. Por favor, digite apenas o número correspondente à sua resposta.",
    },
  };
}

function contador(
  id: string,
  name: string,
  variableName: string,
  limiteVariable: string,
  nextWithin: string,
  nextExceeded: string,
  x: number,
  y: number
) {
  return {
    id,
    type: "contador",
    name,
    is_start: false,
    config: {
      ...pos(x, y),
      variableName,
      limite_variable: limiteVariable,
      limite_passagens: 5,
      increment: 1,
      next_node_id_within: nextWithin,
      next_node_id_exceeded: nextExceeded,
    },
  };
}

function dec(
  id: string,
  name: string,
  variable: string,
  value: string,
  nextTrue: string,
  nextFalse: string,
  x: number,
  y: number
) {
  return {
    id,
    type: "decisao",
    name,
    is_start: false,
    config: {
      ...pos(x, y),
      decisionMode: "simple",
      variable,
      operator: "igual_a",
      comparisonValue: value,
      next_node_id_true: nextTrue,
      next_node_id_false: nextFalse,
    },
  };
}

export function buildFoxFlowNodes(foxHidFormulario: string) {
  const I = FOX_IDS;
  return [
    {
      id: I.inicio,
      type: "inicio",
      name: "Início",
      is_start: true,
      config: { ...pos(40, 40), next_node_id: I.msg_abertura },
    },
    msg(
      I.msg_abertura,
      "Abertura",
      `Olá!\nSou o assistente da Fox Pesquisas. Estamos montando um banco de participantes para pesquisas de mercado, algumas remuneradas e outras não remuneradas.\nCom seu cadastro, poderemos te convidar para participar de pesquisas que combinem com o seu perfil.\n\nAntes de começar:\n• Seus dados serão usados apenas para convites de pesquisa.\n\nVocê gostaria de se cadastrar?\n1️⃣ Sim, quero me cadastrar\n2️⃣ Não, agora não`,
      I.cap_cadastrar,
      40,
      120
    ),
    cap(
      I.cap_cadastrar,
      "Quer cadastrar?",
      "Digite 1 para Sim ou 2 para Não:",
      "quer_cadastrar",
      [
        { id: "1", label: "Sim, quero me cadastrar" },
        { id: "2", label: "Não, agora não" },
      ],
      I.dec_cadastrar_sim,
      40,
      220
    ),
    dec(I.dec_cadastrar_sim, "Cadastrar?", "quer_cadastrar", "1", I.msg_nome, I.msg_nao, 40, 300),
    msg(
      I.msg_nao,
      "Não cadastrar",
      "Sem problemas! Quando quiser participar, envie *Cadastrar-se* por aqui. Obrigado!",
      I.enc_nao,
      280,
      300
    ),
    {
      id: I.enc_nao,
      type: "encerramento",
      name: "Encerramento sem cadastro",
      is_start: false,
      config: { ...pos(280, 380), end_message: "Até breve!" },
    },
    ...ask(
      I.msg_nome,
      I.recv_nome,
      "Nome completo",
      "Perfeito! Qual é o seu nome completo?",
      "nome_completo",
      I.msg_nasc,
      40,
      400,
      { validation_type: "full_name", invalid_prompt: "Informe nome e sobrenome (nome completo)." }
    ),
    ...ask(
      I.msg_nasc,
      I.recv_nasc,
      "Data nascimento",
      "Qual a sua data de nascimento?\nInforme no formato: DD/MM/AAAA.",
      "data_nascimento",
      I.msg_cpf,
      40,
      480,
      {
        validation_type: "date_br",
        invalid_prompt: "Data inválida. Use DD/MM/AAAA (ex.: 15/03/1990).",
      }
    ),
    ...ask(
      I.msg_cpf,
      I.recv_cpf,
      "CPF",
      "Informe seu CPF.\nUsamos para evitar cadastros duplicados e, em pesquisas remuneradas, emissão de comprovantes.\nFormato: XXX.XXX.XXX-XX",
      "cpf",
      I.cap_sexo,
      40,
      560,
      { validation_type: "cpf", invalid_prompt: "CPF inválido. Use o formato XXX.XXX.XXX-XX." }
    ),
    cap(
      I.cap_sexo,
      "Sexo",
      "Como você se identifica?\n(Digite apenas o número)\n\n1️⃣ Masculino\n2️⃣ Feminino\n3️⃣ Outro\n4️⃣ Prefiro não informar",
      "sexo",
      [
        { id: "1", label: "Masculino" },
        { id: "2", label: "Feminino" },
        { id: "3", label: "Outro" },
        { id: "4", label: "Prefiro não informar" },
      ],
      I.cap_estado_civil,
      40,
      640
    ),
    cap(
      I.cap_estado_civil,
      "Estado civil",
      "Qual o seu estado civil?\n(Digite o número)\n\n1️⃣ Solteiro(a)\n2️⃣ Casado(a)\n3️⃣ Viúvo(a)\n4️⃣ União Estável",
      "estado_civil",
      [
        { id: "1", label: "Solteiro(a)" },
        { id: "2", label: "Casado(a)" },
        { id: "3", label: "Viúvo(a)" },
        { id: "4", label: "União Estável" },
      ],
      I.cap_escolaridade,
      40,
      720
    ),
    cap(
      I.cap_escolaridade,
      "Escolaridade",
      "Qual é a sua escolaridade?\n(Digite o número)\n\n1️⃣ Fundamental incompleto/completo\n2️⃣ Médio incompleto/completo\n3️⃣ Superior incompleto\n4️⃣ Superior completo\n5️⃣ Pós-graduação / MBA\n6️⃣ Mestrado / Doutorado",
      "escolaridade",
      [
        { id: "1", label: "Fundamental" },
        { id: "2", label: "Médio" },
        { id: "3", label: "Superior incompleto" },
        { id: "4", label: "Superior completo" },
        { id: "5", label: "Pós-graduação" },
        { id: "6", label: "Mestrado/Doutorado" },
      ],
      I.msg_celular,
      40,
      800
    ),
    ...ask(
      I.msg_celular,
      I.recv_celular,
      "Celular",
      "Qual é o seu celular (WhatsApp) principal, com DDD?\nFormato: (XX) XXXXX-XXXX",
      "celular",
      I.msg_email,
      40,
      880,
      {
        validation_type: "phone_br",
        invalid_prompt: "Telefone inválido. Ex.: (11) 99999-8888",
      }
    ),
    ...ask(
      I.msg_email,
      I.recv_email,
      "E-mail pessoal",
      "Informe o seu e-mail pessoal.\nEx.: seuemail@email.com.br",
      "email_pessoal",
      I.msg_email_com,
      40,
      960,
      { validation_type: "email", invalid_prompt: "E-mail inválido. Ex.: seuemail@email.com.br" }
    ),
    ...ask(
      I.msg_email_com,
      I.recv_email_com,
      "E-mail comercial",
      "Você possui e-mail comercial?\nSe sim, envie aqui.\nSe não tiver, escreva: *não tenho*",
      "email_comercial",
      I.msg_cep,
      40,
      1040,
      {
        validation_type: "email_or_skip",
        invalid_prompt: "Envie um e-mail válido ou escreva: não tenho",
      }
    ),
    ...ask(
      I.msg_cep,
      I.recv_cep,
      "CEP",
      "Qual é o seu CEP?\nEx.: XXXXX-XXX",
      "cep",
      I.msg_numero,
      40,
      1120,
      { validation_type: "cep", invalid_prompt: "CEP inválido. Use XXXXX-XXX." }
    ),
    ...ask(
      I.msg_numero,
      I.recv_numero,
      "Número",
      "Qual é o número do endereço?\nSe não tiver, digite: *não tenho*",
      "numero",
      I.msg_cidade,
      40,
      1200,
      { validation_type: "skip_or_text" }
    ),
    ...ask(
      I.msg_cidade,
      I.recv_cidade,
      "Cidade",
      "Informe a cidade onde você mora:",
      "cidade",
      I.msg_uf,
      40,
      1280
    ),
    ...ask(
      I.msg_uf,
      I.recv_uf,
      "UF",
      "Informe o estado (UF), por exemplo: SP, RJ, MG.",
      "uf",
      I.cap_filhos,
      40,
      1360,
      { validation_type: "uf", invalid_prompt: "UF inválida. Use 2 letras, ex.: SP." }
    ),
    cap(
      I.cap_filhos,
      "Filhos",
      "Você tem filhos?\n1️⃣ Sim\n2️⃣ Não\n3️⃣ Prefiro não informar",
      "tem_filhos",
      [
        { id: "1", label: "Sim" },
        { id: "2", label: "Não" },
        { id: "3", label: "Prefiro não informar" },
      ],
      I.dec_filhos,
      40,
      1440
    ),
    dec(I.dec_filhos, "Tem filhos?", "tem_filhos", "1", I.cap_qtd_filhos, I.cap_carro, 40, 1520),
    cap(
      I.cap_qtd_filhos,
      "Qtd filhos",
      "Quantos filhos você tem?\n(Digite o número)\n\n1️⃣ 1 filho\n2️⃣ 2 filhos\n3️⃣ 3 filhos\n4️⃣ 4 filhos\n5️⃣ 5 filhos",
      "qtd_filhos",
      [
        { id: "1", label: "1 filho" },
        { id: "2", label: "2 filhos" },
        { id: "3", label: "3 filhos" },
        { id: "4", label: "4 filhos" },
        { id: "5", label: "5 filhos" },
      ],
      I.contador_filho,
      280,
      1520
    ),
    contador(
      I.contador_filho,
      "Loop filhos",
      "filho_indice",
      "qtd_filhos",
      I.msg_filho_nome,
      I.cap_carro,
      280,
      1600
    ),
    ...ask(
      I.msg_filho_nome,
      I.recv_filho_nome,
      "Nome filho(a)",
      "Qual o nome do(a) filho(a) {{filho_indice}}?",
      "filho_nome",
      I.msg_filho_nasc,
      480,
      1520,
      { validation_type: "full_name" }
    ),
    ...ask(
      I.msg_filho_nasc,
      I.recv_filho_nasc,
      "Nasc. filho(a)",
      "Qual a data de nascimento do(a) filho(a) {{filho_indice}}?\nFormato: DD/MM/AAAA",
      "filho_nascimento",
      I.cap_filho_sexo,
      480,
      1600,
      { validation_type: "date_br", invalid_prompt: "Use DD/MM/AAAA." }
    ),
    {
      id: I.cap_filho_sexo,
      type: "capturar_entrada",
      name: "Sexo filho(a)",
      is_start: false,
      config: {
        ...pos(480, 1680),
        prompt:
          "Qual o sexo do(a) filho(a) {{filho_indice}}?\n1️⃣ Masculino\n2️⃣ Feminino",
        inputMode: "single_choice",
        variableName: "filho_sexo",
        options: [
          { id: "1", label: "Masculino" },
          { id: "2", label: "Feminino" },
        ],
        next_node_id: I.contador_filho,
        append_options_list: false,
        snapshot_to_array: "filhos_list",
        snapshot_fields: {
          nome: "filho_nome",
          nascimento: "filho_nascimento",
          sexo: "filho_sexo",
        },
      },
    },
    cap(
      I.cap_carro,
      "Carro",
      "Você possui carro?\n1️⃣ Sim\n2️⃣ Não",
      "tem_carro",
      [
        { id: "1", label: "Sim" },
        { id: "2", label: "Não" },
      ],
      I.dec_carro,
      40,
      1680
    ),
    dec(I.dec_carro, "Tem carro?", "tem_carro", "1", I.cap_marca, I.msg_empresa, 40, 1760),
    cap(
      I.cap_marca,
      "Marca carro",
      "Qual a marca do seu carro? (digite o número)\n\n1 Chevrolet  2 Fiat  3 Volkswagen  4 Toyota  5 Hyundai\n6 Honda  7 Jeep  8 Renault  9 Nissan  10 BYD\n11 GWM  12 Outros",
      "carro_marca",
      [
        { id: "1", label: "Chevrolet" },
        { id: "2", label: "Fiat" },
        { id: "3", label: "Volkswagen" },
        { id: "4", label: "Toyota" },
        { id: "5", label: "Hyundai" },
        { id: "6", label: "Honda" },
        { id: "7", label: "Jeep" },
        { id: "8", label: "Renault" },
        { id: "9", label: "Nissan" },
        { id: "10", label: "BYD" },
        { id: "11", label: "GWM" },
        { id: "12", label: "Outros" },
      ],
      I.dec_marca_outros,
      280,
      1760
    ),
    dec(
      I.dec_marca_outros,
      "Marca outros?",
      "carro_marca",
      "12",
      I.msg_marca_outros,
      I.msg_modelo,
      280,
      1840
    ),
    ...ask(
      I.msg_marca_outros,
      I.recv_marca_outros,
      "Marca (outros)",
      "Qual a marca do seu carro?",
      "carro_marca_outros",
      I.msg_modelo,
      480,
      1840
    ),
    ...ask(
      I.msg_modelo,
      I.recv_modelo,
      "Modelo carro",
      "Qual o modelo do seu carro?",
      "carro_modelo",
      I.msg_empresa,
      280,
      1920
    ),
    ...ask(
      I.msg_empresa,
      I.recv_empresa,
      "Empresa",
      "Em qual empresa você atua atualmente?\nSe for autônomo(a), pode escrever isso.",
      "empresa",
      I.msg_segmento,
      40,
      2000
    ),
    ...ask(
      I.msg_segmento,
      I.recv_segmento,
      "Segmento",
      "Qual é o segmento da empresa?\nEx.: tecnologia, varejo, educação, saúde…",
      "segmento_texto",
      I.msg_cargo,
      40,
      2080
    ),
    ...ask(
      I.msg_cargo,
      I.recv_cargo,
      "Cargo",
      "Qual é o seu cargo ou função atual?",
      "cargo",
      I.msg_renda,
      40,
      2160
    ),
    ...ask(
      I.msg_renda,
      I.recv_renda,
      "Renda",
      "Qual é a sua renda familiar aproximada?\nEx.: R$ 5000,00 ou 5000",
      "renda_familiar",
      I.msg_facebook,
      40,
      2240,
      { validation_type: "money_br" }
    ),
    ...ask(
      I.msg_facebook,
      I.recv_facebook,
      "Facebook",
      "Possui Facebook? Se sim, informe @usuario ou link. Se não, escreva: *não tenho*",
      "facebook",
      I.msg_instagram,
      40,
      2320,
      { validation_type: "skip_or_text" }
    ),
    ...ask(
      I.msg_instagram,
      I.recv_instagram,
      "Instagram",
      "Possui Instagram? Se sim, informe @usuario. Se não: *não tenho*",
      "instagram",
      I.msg_linkedin,
      40,
      2400,
      { validation_type: "skip_or_text" }
    ),
    ...ask(
      I.msg_linkedin,
      I.recv_linkedin,
      "LinkedIn",
      "Possui LinkedIn? Se sim, envie o link. Se não: *não tenho*",
      "linkedin",
      I.msg_bancos,
      40,
      2480,
      { validation_type: "skip_or_text" }
    ),
    ...ask(
      I.msg_bancos,
      I.recv_bancos,
      "Bancos",
      "Quais bancos você possui conta?\nEx.: Nubank, Itaú, Caixa…\nOu escreva: *pular*",
      "bancos_texto",
      I.cap_pix_quer,
      40,
      2560,
      { validation_type: "skip_or_text" }
    ),
    cap(
      I.cap_pix_quer,
      "PIX agora?",
      "Quer cadastrar Pix agora? (opcional)\n1️⃣ Sim\n2️⃣ Pular",
      "pix_quer",
      [
        { id: "1", label: "Sim" },
        { id: "2", label: "Pular" },
      ],
      I.dec_pix,
      40,
      2640
    ),
    dec(I.dec_pix, "Quer PIX?", "pix_quer", "1", I.cap_pix_tipo, I.api_fox, 40, 2720),
    cap(
      I.cap_pix_tipo,
      "Tipo PIX",
      "Informe o tipo da chave:\n1️⃣ CPF\n2️⃣ CNPJ\n3️⃣ Telefone\n4️⃣ E-mail\n5️⃣ Chave Aleatória",
      "pix_tipo",
      [
        { id: "1", label: "CPF" },
        { id: "2", label: "CNPJ" },
        { id: "3", label: "Telefone" },
        { id: "4", label: "E-mail" },
        { id: "5", label: "Chave Aleatória" },
      ],
      I.msg_pix_valor,
      280,
      2720
    ),
    ...ask(
      I.msg_pix_valor,
      I.recv_pix_valor,
      "Valor PIX",
      "Informe a chave Pix conforme o tipo escolhido:",
      "pix_valor",
      I.api_fox,
      280,
      2800
    ),
    {
      id: I.api_fox,
      type: "chamada_api",
      name: "Enviar cadastro Fox",
      is_start: false,
      config: {
        ...pos(40, 2880),
        method: "POST",
        url: "https://www.foxcadastro.com.br/public/componentes/cadastro_pf/model/cadastraPessoa.php",
        payloadPreset: "fox_cadastro_pf",
        foxHidChave: FOX_HID_CHAVE,
        foxHidFormulario: foxHidFormulario,
        next_node_id: I.msg_fim,
      },
    },
    msg(
      I.msg_fim,
      "Encerramento",
      `Obrigado por se cadastrar na Fox! 🌟\nSeu perfil já está registrado — assim que surgir uma pesquisa remunerada compatível, um de nossos recrutadores entrará em contato. 📅\n\nWhatsApp Recrutamento: https://wa.me/5511919240025\n(11) 91924-0025\n\nAgradecemos pela confiança! 🙏`,
      I.enc_fim,
      40,
      2960
    ),
    {
      id: I.enc_fim,
      type: "encerramento",
      name: "Fim cadastro Fox",
      is_start: false,
      config: { ...pos(40, 3040), end_message: "Cadastro Fox concluído." },
    },
  ];
}
