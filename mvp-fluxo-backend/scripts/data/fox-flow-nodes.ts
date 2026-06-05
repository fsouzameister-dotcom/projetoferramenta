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
      options,
      next_node_id: next,
      invalid_prompt:
        invalidPrompt ||
        "Não entendi. Por favor, digite apenas o número correspondente à sua resposta.",
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
    dec(I.dec_cadastrar_sim, "Cadastrar?", "quer_cadastrar", "1", I.recv_nome, I.msg_nao, 40, 300),
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
    recv(
      I.recv_nome,
      "Nome completo",
      "Perfeito! Qual é o seu nome completo?",
      "nome_completo",
      I.recv_nasc,
      40,
      400,
      { validation_type: "full_name", invalid_prompt: "Informe nome e sobrenome (nome completo)." }
    ),
    recv(
      I.recv_nasc,
      "Data nascimento",
      "Qual a sua data de nascimento?\nInforme no formato: DD/MM/AAAA.",
      "data_nascimento",
      I.recv_cpf,
      40,
      480,
      {
        validation_type: "date_br",
        invalid_prompt: "Data inválida. Use DD/MM/AAAA (ex.: 15/03/1990).",
      }
    ),
    recv(
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
      I.recv_celular,
      40,
      800
    ),
    recv(
      I.recv_celular,
      "Celular",
      "Qual é o seu celular (WhatsApp) principal, com DDD?\nFormato: (XX) XXXXX-XXXX",
      "celular",
      I.recv_email,
      40,
      880,
      {
        validation_type: "phone_br",
        invalid_prompt: "Telefone inválido. Ex.: (11) 99999-8888",
      }
    ),
    recv(
      I.recv_email,
      "E-mail pessoal",
      "Informe o seu e-mail pessoal.\nEx.: seuemail@email.com.br",
      "email_pessoal",
      I.recv_email_com,
      40,
      960,
      { validation_type: "email", invalid_prompt: "E-mail inválido. Ex.: seuemail@email.com.br" }
    ),
    recv(
      I.recv_email_com,
      "E-mail comercial",
      "Você possui e-mail comercial?\nSe sim, envie aqui.\nSe não tiver, escreva: *não tenho*",
      "email_comercial",
      I.recv_cep,
      40,
      1040,
      {
        validation_type: "email_or_skip",
        invalid_prompt: "Envie um e-mail válido ou escreva: não tenho",
      }
    ),
    recv(
      I.recv_cep,
      "CEP",
      "Qual é o seu CEP?\nEx.: XXXXX-XXX",
      "cep",
      I.recv_numero,
      40,
      1120,
      { validation_type: "cep", invalid_prompt: "CEP inválido. Use XXXXX-XXX." }
    ),
    recv(
      I.recv_numero,
      "Número",
      "Qual é o número do endereço?\nSe não tiver, digite: *não tenho*",
      "numero",
      I.recv_cidade,
      40,
      1200,
      { validation_type: "skip_or_text" }
    ),
    recv(I.recv_cidade, "Cidade", "Informe a cidade onde você mora:", "cidade", I.recv_uf, 40, 1280),
    recv(
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
    dec(I.dec_filhos, "Tem filhos?", "tem_filhos", "1", I.recv_filho_nome, I.cap_carro, 40, 1520),
    recv(
      I.recv_filho_nome,
      "Nome filho(a)",
      "Qual o nome do(a) filho(a)?",
      "filho_nome",
      I.recv_filho_nasc,
      280,
      1520,
      { validation_type: "full_name" }
    ),
    recv(
      I.recv_filho_nasc,
      "Nasc. filho(a)",
      "Qual a data de nascimento do(s) seu(s) filho(s)?\nFormato: DD/MM/AAAA",
      "filho_nascimento",
      I.cap_filho_sexo,
      280,
      1520,
      { validation_type: "date_br", invalid_prompt: "Use DD/MM/AAAA." }
    ),
    cap(
      I.cap_filho_sexo,
      "Sexo filho(a)",
      "Qual o sexo do(s) filho(s)?\n1️⃣ Masculino\n2️⃣ Feminino",
      "filho_sexo",
      [
        { id: "1", label: "Masculino" },
        { id: "2", label: "Feminino" },
      ],
      I.cap_carro,
      280,
      1600
    ),
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
    dec(I.dec_carro, "Tem carro?", "tem_carro", "1", I.cap_marca, I.recv_empresa, 40, 1760),
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
      I.recv_marca_outros,
      I.recv_modelo,
      280,
      1840
    ),
    recv(
      I.recv_marca_outros,
      "Marca (outros)",
      "Qual a marca do seu carro?",
      "carro_marca_outros",
      I.recv_modelo,
      480,
      1840
    ),
    recv(
      I.recv_modelo,
      "Modelo carro",
      "Qual o modelo do seu carro?",
      "carro_modelo",
      I.recv_empresa,
      280,
      1920
    ),
    recv(
      I.recv_empresa,
      "Empresa",
      "Em qual empresa você atua atualmente?\nSe for autônomo(a), pode escrever isso.",
      "empresa",
      I.recv_segmento,
      40,
      2000
    ),
    recv(
      I.recv_segmento,
      "Segmento",
      "Qual é o segmento da empresa?\nEx.: tecnologia, varejo, educação, saúde…",
      "segmento_texto",
      I.recv_cargo,
      40,
      2080
    ),
    recv(I.recv_cargo, "Cargo", "Qual é o seu cargo ou função atual?", "cargo", I.recv_renda, 40, 2160),
    recv(
      I.recv_renda,
      "Renda",
      "Qual é a sua renda familiar aproximada?\nEx.: R$ 5000,00 ou 5000",
      "renda_familiar",
      I.recv_facebook,
      40,
      2240,
      { validation_type: "money_br" }
    ),
    recv(
      I.recv_facebook,
      "Facebook",
      "Possui Facebook? Se sim, informe @usuario ou link. Se não, escreva: *não tenho*",
      "facebook",
      I.recv_instagram,
      40,
      2320,
      { validation_type: "skip_or_text" }
    ),
    recv(
      I.recv_instagram,
      "Instagram",
      "Possui Instagram? Se sim, informe @usuario. Se não: *não tenho*",
      "instagram",
      I.recv_linkedin,
      40,
      2400,
      { validation_type: "skip_or_text" }
    ),
    recv(
      I.recv_linkedin,
      "LinkedIn",
      "Possui LinkedIn? Se sim, envie o link. Se não: *não tenho*",
      "linkedin",
      I.recv_bancos,
      40,
      2480,
      { validation_type: "skip_or_text" }
    ),
    recv(
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
      I.recv_pix_valor,
      280,
      2720
    ),
    recv(
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
