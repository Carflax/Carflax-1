import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_IA || "");

export type Temperatura = "Quente" | "Morno" | "Frio";

// Remove acentos e normaliza para casar as regras sem depender de acentuação.
const normalize = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Sinais de alta intenção de compra → Quente.
const HOT_PATTERNS: RegExp[] = [
  /\bpreco\b/, /quanto\s+(custa|fica|sai|e|da|vale)/, /\bvalor\b/, /\borcamento\b/,
  /tem\s+(em\s+)?estoque/, /disponivel/, /\breservar?\b/, /(pode|consegue|da\s+pra)\s+separar/,
  /\bpix\b/, /\bboleto\b/, /cartao/, /parcel/, /forma\s+de\s+pagamento/,
  /prazo\s+de\s+entrega/, /\bfrete\b/, /quero\s+(comprar|levar|fechar|esse|essa)/,
  /vou\s+(levar|querer|comprar)/, /manda(r)?\s+o\s+pix/, /fech(ar|ado|amos|a)\b/,
  /qual\s+o\s+total/, /pode\s+faturar/,
];

// Perguntas sobre produto / compatibilidade → Morno.
const WARM_PATTERNS: RegExp[] = [
  /\bserve\b/, /compativel/, /diferenca/, /\boriginal\b/, /\bparalela\b/, /encaixa/,
  /funciona\s+n[oa]/, /\bmedida\b/, /referencia/, /\bcodigo\b/, /\bmarca\b/, /\bmodelo\b/,
  /voce?s?\s+tem/, /\bvcs?\s+tem/, /tem\s+(pra|para|pro|de|o|a|um|uma)\b/,
];

// Mensagens sem contexto de compra → Frio.
const GREETING_ONLY =
  /^(oi+|ola|e?\s*ai|bom\s+dia|boa\s+tarde|boa\s+noite|opa|blz|beleza|tudo\s+bem|ok+|obrigad[oa]|valeu|\?|\.|\!)+$/;

/**
 * Classificação por regras (heurística, custo zero). Cobre a maioria das conversas
 * sem chamar IA. Retorna a temperatura quando há sinal claro, ou `null` quando é
 * ambíguo — nesse caso o chamador deve cair no fallback de IA (classifyTemperature).
 */
export function classifyByRules(
  messages: Array<{ sender: "me" | "contact"; text: string }>
): Temperatura | null {
  const contactMsgs = messages
    .filter(
      (m) =>
        m.sender === "contact" &&
        m.text &&
        !m.text.startsWith("🎵") &&
        !m.text.startsWith("📎"),
    )
    .map((m) => m.text.trim())
    .filter(Boolean);

  if (contactMsgs.length === 0) return "Frio";

  const joined = normalize(contactMsgs.join(" "));
  const recent = normalize(contactMsgs.slice(-5).join(" "));

  // Alta intenção em qualquer ponto da conversa → Quente.
  if (HOT_PATTERNS.some((r) => r.test(joined))) return "Quente";

  // Apenas cumprimentos / mensagens vazias de contexto → Frio.
  if (contactMsgs.every((m) => GREETING_ONLY.test(normalize(m)))) return "Frio";

  // Pergunta sobre produto/compatibilidade, ou qualquer pergunta com contexto → Morno.
  if (WARM_PATTERNS.some((r) => r.test(recent)) || recent.includes("?"))
    return "Morno";

  // Sem sinal claro → deixa a IA decidir.
  return null;
}

/**
 * Classificação inteligente: tenta as regras primeiro (grátis) e só usa IA quando
 * o resultado é ambíguo. Reduz drasticamente o número de chamadas ao Gemini.
 */
export async function classifyTemperatureSmart(
  messages: Array<{ sender: "me" | "contact"; text: string }>
): Promise<Temperatura> {
  const byRules = classifyByRules(messages);
  if (byRules) return byRules;
  return classifyTemperature(messages);
}

export async function classifyTemperature(
  messages: Array<{ sender: "me" | "contact"; text: string }>
): Promise<"Quente" | "Morno" | "Frio"> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const transcript = messages
    .filter(m => m.text && !m.text.startsWith("🎵") && !m.text.startsWith("📎"))
    .slice(-10)
    .map(m => `${m.sender === "me" ? "Vendedor" : "Cliente"}: ${m.text}`)
    .join("\n");

  const prompt = `Você é um analista de leads de vendas de autopeças. Analise a conversa e classifique o interesse do cliente.

Responda APENAS com uma das três palavras exatas, sem explicações:
- Quente: cliente pediu preço, confirmou que quer comprar, pediu para reservar, perguntou sobre forma de pagamento, prazo de entrega ou disponibilidade de peça específica com intenção clara.
- Morno: cliente fez perguntas sobre produtos, marcas ou compatibilidade mas ainda não demonstrou intenção de compra; ou iniciou conversa mas ainda está avaliando.
- Frio: cliente enviou apenas "oi", "olá", mensagem sem contexto, parou de responder, ou claramente não tem interesse em comprar.

Exemplos:
- "Tem filtro de óleo para Gol 1.0?" → Morno
- "Quanto custa o filtro e tem em estoque?" → Quente
- "Oi" → Frio
- "Preciso de um par de pastilhas, pode separar?" → Quente
- "Qual a diferença entre a original e a paralela?" → Morno

Conversa:
${transcript}

Classificação:`;

  const result = await model.generateContent(prompt);
  const response = result.response.text().trim();

  if (response === "Quente" || response === "Morno" || response === "Frio") return response;
  if (response.includes("Quente")) return "Quente";
  if (response.includes("Morno")) return "Morno";
  return "Frio";
}

/** Parte de entrada para geração de criativo: texto ou imagem (base64 puro, sem prefixo data:). */
export type CreativePart =
  | { text: string }
  | { image: { data: string; mimeType: string } };

/**
 * Gera imagem(ns) de criativo a partir de imagens de referência + instruções de texto,
 * usando o modelo de imagem do Gemini ("Nano Banana"). Retorna data URLs (data:image/...;base64,...).
 */
// Modelos de imagem candidatos, em ordem de preferência. O disponível varia conforme
// a chave/projeto Google AI, então tentamos um a um até algum funcionar.
const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp-image-generation",
];

export async function generateCreativeImage(parts: CreativePart[]): Promise<string[]> {
  const contentParts = parts.map((p) =>
    "image" in p
      ? { inlineData: { data: p.image.data, mimeType: p.image.mimeType } }
      : { text: p.text }
  );

  let lastError: unknown = null;
  for (const modelName of IMAGE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        // O modelo de imagem só devolve imagem quando pedimos explicitamente as modalidades.
        generationConfig: { responseModalities: ["Text", "Image"] } as Record<string, unknown>,
      });

      const result = await model.generateContent(contentParts);

      const images: string[] = [];
      for (const cand of result.response.candidates || []) {
        for (const part of cand.content?.parts || []) {
          const inline = part.inlineData;
          if (inline?.data) {
            images.push(`data:${inline.mimeType || "image/png"};base64,${inline.data}`);
          }
        }
      }
      if (images.length > 0) return images;
      // Sem imagem (mas sem erro): tenta o próximo modelo.
    } catch (err) {
      lastError = err;
      // Modelo indisponível/404 → tenta o próximo.
    }
  }

  if (lastError) throw lastError;
  return [];
}

/**
 * Assistente de texto (Genos): responde perguntas/dicas criativas usando o Gemini de texto.
 */
export async function askGenos(prompt: string, context?: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const system =
    "Você é o Genos, um assistente criativo de marketing de autopeças (Carflax). " +
    "Ajude com ideias de copy, ângulos de campanha, prompts de imagem e estratégias criativas. " +
    "Seja direto, prático e em português do Brasil.";
  const full = context ? `${system}\n\nContexto do criativo:\n${context}\n\nPergunta:\n${prompt}` : `${system}\n\nPergunta:\n${prompt}`;
  const result = await model.generateContent(full);
  return result.response.text().trim();
}

export interface ClienteKnowledgeMessage {
  role: "user" | "model";
  text: string;
  timestamp: string;
}

export async function chatClienteKnowledge(
  messages: ClienteKnowledgeMessage[],
  dadosCadcli: Record<string, unknown>,
  dadosExtraidos: Record<string, unknown>,
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const system = `Você é o assistente de conhecimento de clientes da Carflax (distribuidora de autopeças).
Seu papel é ajudar o vendedor a registrar e consultar informações sobre cada cliente.

DADOS DO SISTEMA (ERP Citel - CADCLI):
${JSON.stringify(dadosCadcli, null, 2)}

DADOS JÁ REGISTRADOS PELO VENDEDOR:
${Object.keys(dadosExtraidos).length > 0 ? JSON.stringify(dadosExtraidos, null, 2) : "(nenhum dado registrado ainda)"}

INSTRUÇÕES:
- Quando o vendedor informar um dado novo (ex: "o comprador agora é o Jerson"), confirme que armazenou e SEMPRE faça uma pergunta de follow-up para extrair mais informações.
- Responda de forma curta e objetiva.
- SEMPRE termine sua resposta com uma pergunta relevante para aprofundar o conhecimento sobre o cliente. Nunca encerre sem perguntar algo.
- Perguntas úteis (use como guia, varie entre elas): quem é o decisor de compras, qual o segmento (indústria/comércio/oficina/obra/manutenção), quais concorrentes atendem esse cliente, qual o potencial estimado de compra mensal, quais categorias de produtos mais compram, qual o prazo de pagamento preferido, tem contrato com algum concorrente, qual o melhor horário para contato, tem alguma reclamação ou pendência, qual a frequência ideal de visitas.
- Use os dados do ERP para contextualizar (ex: se o cliente não compra há muito tempo, pergunte o motivo).
- Quando o vendedor perguntar algo sobre o cliente, use os dados do ERP e os dados registrados para responder, e faça uma pergunta adicional.
- Retorne no final da resposta um bloco JSON (entre \`\`\`json e \`\`\`) com os dados extraídos ATUALIZADOS caso o vendedor tenha informado algo novo. O JSON deve conter TODOS os dados já registrados + os novos. Se nenhum dado novo foi informado, NÃO inclua o bloco JSON.

Exemplo de resposta com dado novo:
"Anotado! O novo comprador dessa empresa é o Jerson. Você sabe qual o cargo dele?
\`\`\`json
{"comprador":"Jerson"}
\`\`\`"`;

  const contents = [
    { role: "user" as const, parts: [{ text: system }] },
    { role: "model" as const, parts: [{ text: "Entendido! Sou o assistente de conhecimento de clientes da Carflax. Estou pronto para ajudar a registrar e consultar informações sobre este cliente. O que você gostaria de me contar ou perguntar?" }] },
    ...messages.map(m => ({
      role: m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.text }],
    })),
  ];

  const result = await model.generateContent({ contents });
  return result.response.text().trim();
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          data: audioBase64,
          mimeType: mimeType,
        },
      },
      { text: "Transcreva este áudio exatamente como falado. Se não houver fala, responda apenas '[Sem áudio detectado]'. Não adicione comentários." },
    ]);

    return result.response.text();
  } catch (error) {
    console.error("[Gemini] Erro na transcrição:", error);
    throw error;
  }
}
