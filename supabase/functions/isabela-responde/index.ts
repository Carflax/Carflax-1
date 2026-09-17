// @ts-expect-error: Deno module resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// ─── Configurações ──────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_KEY = Deno.env.get('GEMINI_IA') || '';
const EVO_URL = Deno.env.get('EVO_URL') || '';
const EVO_API_KEY = Deno.env.get('EVO_API_KEY') || '';
const EVO_INSTANCE = Deno.env.get('EVO_INSTANCE') || 'Trafego';
// URL do backend que conecta ao ERP Oracle (mesmo servidor que o HUB usa)
const BACKEND_URL = Deno.env.get('BACKEND_URL') || 'https://marketing-carflax.velbav.easypanel.host';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface IsabelaPayload {
  remoteJid: string;
  msgId: string;
  senderName: string;
  text: string;
  tipo: string;
  mediaBase64?: string;
  mediaMime?: string;
}

interface IsabelaConfig {
  ativo: boolean;
  modo: 'teste' | 'todos';
  numeros_teste: string[];
  informacoes_loja: string;
  instrucoes_extras: string;
}

interface HistoricoMsg {
  sender: 'me' | 'contact';
  texto: string;
  tipo: string;
  autor?: string;
  timestamp: string;
}

// ─── Evolution API helpers ───────────────────────────────────────────────────
async function evoTyping(remoteJid: string, durationMs: number) {
  try {
    await fetch(`${EVO_URL}/chat/presence/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_API_KEY },
      body: JSON.stringify({ number: remoteJid, options: { presence: 'composing', delay: durationMs } }),
    });
  } catch (_e) {
    // ignora — a presença de digitação é cosmética
  }
}

async function evoSendText(remoteJid: string, text: string): Promise<string | null> {
  try {
    const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_API_KEY },
      body: JSON.stringify({
        number: remoteJid,
        text,
        options: { delay: 0, presence: 'composing' },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Isabela] Erro ao enviar mensagem:', err);
      return null;
    }
    const data = await res.json() as { key?: { id?: string } };
    return data?.key?.id || null;
  } catch (e) {
    console.error('[Isabela] Exceção ao enviar mensagem:', e);
    return null;
  }
}

// ─── Gemini helper ───────────────────────────────────────────────────────────
async function geminiGenerate(parts: unknown[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 512,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function transcribeAudio(base64: string, mime: string): Promise<string> {
  const parts = [
    { inlineData: { data: base64, mimeType: mime } },
    { text: 'Transcreva este áudio de WhatsApp exatamente como foi dito, em português. Se não houver voz ou for inaudível, responda apenas: [sem voz].' },
  ];
  return geminiGenerate(parts);
}

async function describeImage(base64: string, mime: string, caption: string): Promise<string> {
  const parts = [
    { inlineData: { data: base64, mimeType: mime } },
    { text: `Descreva esta imagem de forma objetiva e concisa para contexto de atendimento de loja de materiais hidráulicos e elétricos. Foque em identificar: tipo de peça/produto, tamanho/medida se visível, marca se visível, estado (novo/usado). Caption do cliente: "${caption || 'sem legenda'}"` },
  ];
  return geminiGenerate(parts);
}

// Stop words do português que não ajudam na busca de produtos
const STOP_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para',
  'com', 'sem', 'por', 'que', 'nao', 'sim', 'tem', 'ter',
  'uma', 'uns', 'umas', 'isso', 'esse', 'essa', 'este', 'esta', 'aqui',
  'ali', 'la', 'mais', 'menos', 'muito', 'pouco', 'nada', 'tudo', 'algo',
  'voce', 'vc', 'vcs', 'ele', 'ela', 'eles', 'elas', 'meu', 'minha',
  'seu', 'sua', 'seus', 'suas', 'pra', 'pro', 'pras', 'pros',
  'porque', 'qual', 'quais', 'onde', 'quando', 'como', 'quem',
  'tinha', 'quero', 'queria', 'preciso', 'precisa',
  'pode', 'consigo', 'daria', 'seria', 'sabe',
]);

// Cache em memória do catálogo (válido por 10 minutos por instância)
let catalogoCache: Array<{ cod: string; descricao: string; marca: string; preco: number; disponivel: number }> | null = null;
let catalogoCacheTs = 0;
const CATALOGO_TTL_MS = 10 * 60 * 1000; // 10 minutos

// ─── Busca catálogo do ERP via backend ────────────────────────────────────────
// A API do backend conecta ao Oracle (ERP Citel) e retorna TOTAL_DISPONIVEL
// já consolidado de TODAS as empresas (001 + 002 + 003 = total real do estoque).
async function carregarCatalogo(): Promise<typeof catalogoCache> {
  const agora = Date.now();
  if (catalogoCache && agora - catalogoCacheTs < CATALOGO_TTL_MS) return catalogoCache;

  try {
    const res = await fetch(`${BACKEND_URL}/api/dashboard/produtos`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      console.error('[Isabela] Erro ao carregar catálogo do ERP:', res.status, await res.text());
      return catalogoCache; // retorna cache antigo se houver
    }
    const data = await res.json() as Array<{
      COD_ITEM: string;
      DESCRICAO: string;
      MARCA: string;
      PRECO_VENDA: string | number;
      TOTAL_DISPONIVEL: string | number;
    }>;

    const parseBrl = (v: string | number | null | undefined) => {
      if (v === undefined || v === null || v === '') return 0;
      const s = String(v).trim();
      if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
      return parseFloat(s) || 0;
    };

    catalogoCache = data.map(p => ({
      cod: p.COD_ITEM,
      descricao: p.DESCRICAO || '',
      marca: p.MARCA || '',
      preco: parseBrl(p.PRECO_VENDA),
      disponivel: parseBrl(p.TOTAL_DISPONIVEL),
    }));
    catalogoCacheTs = agora;
    console.log('[Isabela] Catálogo carregado do ERP:', catalogoCache.length, 'produtos');
    return catalogoCache;
  } catch (e) {
    console.error('[Isabela] Exceção ao carregar catálogo:', e);
    return catalogoCache;
  }
}

// ─── Busca produtos no catálogo ──────────────────────────────────────────────────
async function buscarProdutos(query: string): Promise<string> {
  try {
    const catalogo = await carregarCatalogo();
    if (!catalogo || catalogo.length === 0) return '';

    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Extrai termos úteis (sem stop words, sem símbolos, mín 2 chars)
    const termos = query
      .split(/\s+/)
      .map(t => t.replace(/[^\w]/g, '').trim())
      .filter(t => t.length >= 2 && !STOP_WORDS.has(normalize(t)))
      .slice(0, 8);

    if (termos.length === 0) return '';

    // Pontua cada produto: quantos termos da busca casam (descricao + marca)
    const resultados = catalogo
      .map(p => {
        const desc = normalize(p.descricao);
        const marc = normalize(p.marca);
        const score = termos.reduce(
          (acc, t) => acc + (desc.includes(normalize(t)) || marc.includes(normalize(t)) ? 1 : 0),
          0
        );
        return { p, score };
      })
      .filter(r => r.score > 0) // ao menos 1 termo casou
      .sort((a, b) => {
        // Desempate: mais termos casados primeiro; depois disponibilidade
        if (b.score !== a.score) return b.score - a.score;
        return b.p.disponivel - a.p.disponivel;
      })
      .slice(0, 6);

    if (resultados.length === 0) return '';

    return resultados
      .map(({ p }) => {
        const estoqueLabel = p.disponivel > 0
          ? `Em estoque: ${p.disponivel}`
          : 'Sem estoque';
        return `• ${p.descricao} (${p.marca}) — R$ ${p.preco.toFixed(2).replace('.', ',')} | ${estoqueLabel}`;
      })
      .join('\n');
  } catch (e) {
    console.error('[Isabela] Erro ao buscar produtos:', e);
    return '';
  }
}

// ─── Detecta se é pergunta de produto ────────────────────────────────────────
function precisaBuscarProduto(texto: string): boolean {
  const lower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const gatilhos = [
    /\btem\b/, /\btinha\b/, /\bvende\b/, /\bvendendo\b/, /\bpoco\b/,
    /\bpreco\b/, /\bquanto\b/, /\bvalor\b/, /\bestoque\b/, /\bdisponivel\b/,
    /\btubo\b/, /\bcano\b/, /\bvalvula\b/, /\bregistro\b/, /\bengate\b/,
    /\bcurva\b/, /\bjoelho\b/, /\bte\b/, /\bredutor\b/, /\bcap\b/,
    /\bfio\b/, /\bcabo\b/, /\bdisjuntor\b/, /\btomada\b/, /\binterruptor\b/,
    /\beletroduto\b/, /\bconduite\b/, /\bquadro\b/, /\bdiferencial\b/,
    /\bamanco\b/, /\bfortlev\b/, /\btigre\b/, /\btopfusion\b/, /\bdeca\b/,
    /\bmarca\b/, /\bmodelo\b/, /\breservar\b/, /\bseparar\b/,
  ];
  return gatilhos.some(g => g.test(lower));
}

// ─── Histórico de conversa ───────────────────────────────────────────────────
async function carregarHistorico(remoteJid: string, limit = 15): Promise<HistoricoMsg[]> {
  const { data } = await supabase
    .from('marketing_whatsapp')
    .select('sender, texto, tipo, autor, timestamp')
    .eq('remote_jid', remoteJid)
    .neq('tipo', 'internal_note')
    .order('timestamp', { ascending: false })
    .limit(limit);

  return ((data || []) as HistoricoMsg[]).reverse();
}

// ─── Verifica se deve responder ───────────────────────────────────────────────
async function deveResponder(remoteJid: string, config: IsabelaConfig): Promise<boolean> {
  if (!config.ativo) return false;

  // Modo teste: só responde se o número estiver na lista
  if (config.modo === 'teste') {
    const num = remoteJid.split('@')[0];
    const naLista = config.numeros_teste.some(n => num.endsWith(n) || n.endsWith(num));
    if (!naLista) return false;
  }

  // Verifica estado da conversa
  const { data: conv } = await supabase
    .from('isabela_conversas')
    .select('status')
    .eq('remote_jid', remoteJid)
    .maybeSingle();

  if (conv?.status === 'pausada' || conv?.status === 'assumida') return false;

  return true;
}

// ─── Detecta se precisa transferir ───────────────────────────────────────────
function precisaTransferir(texto: string): boolean {
  const lower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sinais = [
    /falar com (o )?(vendedor|atendente|pessoa|humano|gerente)/,
    /me transfere/,
    /quero falar com alguem/,
    /tem alguem para atender/,
    /pode chamar (o )?(vendedor|atendente)/,
    /nao quero falar com (robo|bot|ia)/,
  ];
  return sinais.some(s => s.test(lower));
}

// ─── Salva resposta da Isabela no banco ───────────────────────────────────────
async function salvarRespostaIsabela(remoteJid: string, msgId: string, texto: string) {
  const now = new Date().toISOString();
  try {
    await supabase.from('marketing_whatsapp').upsert({
      message_id: msgId,
      remote_jid: remoteJid,
      texto,
      tipo: 'text',
      sender: 'me',
      status: 'sent',
      timestamp: now,
      autor: 'isabela',
    }, { onConflict: 'message_id' });

    await supabase.from('marketing_clientes').upsert({
      remote_jid: remoteJid,
      ultima_mensagem: texto,
      ultima_conversa_em: now,
      updated_at: now,
    }, { onConflict: 'remote_jid', ignoreDuplicates: false });
  } catch (e) {
    console.error('[Isabela] Erro ao salvar resposta:', e);
  }
}

// ─── Atualiza estado da conversa ─────────────────────────────────────────────
async function upsertConversa(remoteJid: string, patch: Record<string, unknown>) {
  const agora = new Date().toISOString();
  await supabase.from('isabela_conversas').upsert(
    { remote_jid: remoteJid, updated_at: agora, ...patch },
    { onConflict: 'remote_jid' }
  );
}

// ─── Gera resposta com Gemini ─────────────────────────────────────────────────
async function gerarResposta(params: {
  config: IsabelaConfig;
  senderName: string;
  mensagemAtual: string;
  tipoMensagem: string;
  historico: HistoricoMsg[];
  contextoMidia?: string;
  produtosEncontrados?: string;
}): Promise<string> {
  const {
    config, senderName, mensagemAtual, tipoMensagem,
    historico, contextoMidia, produtosEncontrados,
  } = params;

  // Monta histórico formatado
  const historicoFormatado = historico
    .slice(-12)
    .map(m => {
      const quem = m.sender === 'me'
        ? (m.autor === 'isabela' ? 'Isabela' : 'Vendedor')
        : senderName;
      const texto = m.texto || (m.tipo !== 'text' ? `[${m.tipo}]` : '');
      return `${quem}: ${texto}`;
    })
    .join('\n');

  // Contexto de mídia
  let ctxMidia = '';
  if (tipoMensagem === 'audio' && contextoMidia) {
    ctxMidia = `\n[O cliente mandou um ÁUDIO. Transcrição: "${contextoMidia}"]`;
  } else if (tipoMensagem === 'image' && contextoMidia) {
    ctxMidia = `\n[O cliente mandou uma IMAGEM. Descrição: "${contextoMidia}"]`;
  } else if (tipoMensagem === 'video') {
    ctxMidia = `\n[O cliente mandou um vídeo.]`;
  } else if (tipoMensagem === 'document') {
    ctxMidia = `\n[O cliente mandou um documento: "${mensagemAtual}"]`;
  } else if (tipoMensagem === 'sticker') {
    ctxMidia = `\n[O cliente mandou um sticker/figurinha.]`;
  }

  // Produtos encontrados
  let ctxProdutos = '';
  if (produtosEncontrados) {
    ctxProdutos = `\n\nPRODUTOS NO ESTOQUE (use esses dados para responder):\n${produtosEncontrados}`;
  }

  const system = `Você é Isabela, atendente da Carflax Hidráulica e Elétrica. Você é uma pessoa real, não um robô ou IA.

INFORMAÇÕES DA LOJA:
${config.informacoes_loja}

${config.instrucoes_extras ? `ORIENTAÇÕES:\n${config.instrucoes_extras}` : ''}
${ctxProdutos}

COMO VOCÊ SE COMPORTA:
- Você fala como uma atendente de loja real no WhatsApp: linguagem natural, informal mas profissional
- Use frases curtas, como se estivesse digitando de verdade (sem textos longos e formais)
- Nunca use frases de robô tipo "Como posso te ajudar?", "Olá! Sou a Isabela, assistente virtual..."
- Nunca se identifique como IA ou robô. Se perguntarem, diga que é atendente da loja
- Use emojis com moderação (máximo 1-2 por mensagem)
- Quando souber o preço, fale o preço. Quando tiver estoque, confirme
- Se não souber responder, diga "deixa eu verificar aqui" e transfere para o vendedor
- Não invente preços ou estoque. Use apenas os dados fornecidos
- Para saudações simples ("oi", "olá"), responda simplesmente: "Oi! Pode falar 😊"
- Para áudios, responda ao CONTEÚDO do áudio, não mencione que foi áudio
- Para imagens de peças, tente identificar e ajudar com o produto

QUANDO TRANSFERIR PARA O VENDEDOR:
- Cliente pede explicitamente para falar com pessoa/vendedor
- Pergunta muito específica que você não tem dados para responder
- Negociação de preço/condição especial
- Reclamação ou problema sério
- Pedido grande ou complexo

HISTÓRICO DA CONVERSA:
${historicoFormatado}
${ctxMidia}

Cliente (${senderName}): ${tipoMensagem === 'audio' && contextoMidia ? contextoMidia : mensagemAtual}

Isabela:`;

  const resposta = await geminiGenerate([{ text: system }]);
  return resposta;
}

// ─── Handler principal ────────────────────────────────────────────────────────
async function processarMensagem(payload: IsabelaPayload): Promise<void> {
  const { remoteJid, msgId, senderName, text, tipo, mediaBase64, mediaMime } = payload;

  // 1. Carrega configuração da Isabela
  const { data: configData, error: configError } = await supabase
    .from('isabela_config')
    .select('ativo, modo, numeros_teste, informacoes_loja, instrucoes_extras')
    .eq('id', 1)
    .single();

  if (configError || !configData) {
    console.log('[Isabela] Configuração não encontrada:', configError?.message);
    return;
  }

  const config = configData as IsabelaConfig;

  // 2. Verifica se deve responder
  const responde = await deveResponder(remoteJid, config);
  if (!responde) {
    console.log('[Isabela] Não deve responder para:', remoteJid);
    return;
  }

  // 3. Verifica se precisa transferir (antes de qualquer processamento)
  if (precisaTransferir(text)) {
    await upsertConversa(remoteJid, {
      status: 'transferida',
      transferida_em: new Date().toISOString(),
      motivo_transferencia: 'Cliente solicitou falar com vendedor',
    });
    const msgTransf = 'Claro! Vou chamar um de nossos atendentes agora 😊';
    await evoTyping(remoteJid, 1500);
    await new Promise(r => setTimeout(r, 1500));
    const idEnviado = await evoSendText(remoteJid, msgTransf);
    if (idEnviado) {
      await salvarRespostaIsabela(remoteJid, `isabela_${idEnviado}`, msgTransf);
    }
    return;
  }

  // 4. Processa mídia se houver
  let contextoMidia: string | undefined;

  if (tipo === 'audio' && mediaBase64 && mediaMime) {
    try {
      const transcricao = await transcribeAudio(mediaBase64, mediaMime);
      if (transcricao && transcricao !== '[sem voz]') {
        contextoMidia = transcricao;
        console.log('[Isabela] Áudio transcrito:', transcricao.substring(0, 100));
      }
    } catch (e) {
      console.error('[Isabela] Erro ao transcrever áudio:', e);
    }
  } else if (tipo === 'image' && mediaBase64 && mediaMime) {
    try {
      const descricao = await describeImage(mediaBase64, mediaMime, text);
      contextoMidia = descricao;
      console.log('[Isabela] Imagem descrita:', descricao.substring(0, 100));
    } catch (e) {
      console.error('[Isabela] Erro ao descrever imagem:', e);
    }
  }

  // 5. Carrega histórico (antes da busca para poder enriquecer o contexto)
  const historico = await carregarHistorico(remoteJid);

  // 6. Busca produtos se a mensagem pedir
  let produtosEncontrados: string | undefined;
  const textoParaBusca = contextoMidia || text;

  if (precisaBuscarProduto(textoParaBusca)) {
    // Enriquece a busca com contexto do histórico quando a mensagem é curta.
    // Ex: cliente disse antes "disjuntor steck 125a" e agora diz "e da steck nao tem?"
    // → combina os dois para buscar "disjuntor steck 125a e da steck nao tem"
    let termoBusca = textoParaBusca.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (termoBusca.split(/\s+/).length <= 5 && historico.length > 0) {
      // Pega as últimas 4 mensagens do cliente para contexto adicional
      const ctxCliente = historico
        .filter(m => m.sender === 'contact')
        .slice(-4)
        .map(m => m.texto || '')
        .filter(Boolean)
        .join(' ');
      if (ctxCliente) termoBusca = `${ctxCliente} ${termoBusca}`;
    }
    termoBusca = termoBusca.substring(0, 200);
    produtosEncontrados = await buscarProdutos(termoBusca);
    if (produtosEncontrados) {
      console.log('[Isabela] Produtos encontrados para:', termoBusca.substring(0, 80));
    } else {
      console.log('[Isabela] Nenhum produto encontrado para:', termoBusca.substring(0, 80));
    }
  }

  // 7. Gera resposta com Gemini
  let resposta: string;
  try {
    resposta = await gerarResposta({
      config,
      senderName,
      mensagemAtual: text,
      tipoMensagem: tipo,
      historico,
      contextoMidia,
      produtosEncontrados,
    });
  } catch (e) {
    console.error('[Isabela] Erro ao gerar resposta:', e);
    // Em caso de erro da IA, transfere para o vendedor
    await upsertConversa(remoteJid, {
      status: 'transferida',
      transferida_em: new Date().toISOString(),
      motivo_transferencia: `Erro interno: ${String(e).substring(0, 100)}`,
      ultimo_erro: String(e).substring(0, 200),
    });
    return;
  }

  if (!resposta) {
    console.log('[Isabela] Resposta vazia gerada para:', remoteJid);
    return;
  }

  // 8. Simula delay de digitação realista (aprox. 50ms por caractere, entre 1.5s e 5s)
  const delayMs = Math.min(Math.max(resposta.length * 45, 1500), 5000);
  await evoTyping(remoteJid, delayMs);
  await new Promise(r => setTimeout(r, delayMs));

  // 9. Envia a resposta
  const idEnviado = await evoSendText(remoteJid, resposta);

  if (!idEnviado) {
    console.error('[Isabela] Falha ao enviar resposta para:', remoteJid);
    return;
  }

  // 10. Salva no banco
  await salvarRespostaIsabela(remoteJid, `isabela_${idEnviado}`, resposta);

  // 11. Atualiza estado da conversa
  const { data: convAtual } = await supabase
    .from('isabela_conversas')
    .select('respostas')
    .eq('remote_jid', remoteJid)
    .maybeSingle();

  const respostasAnterior = (convAtual as { respostas?: number } | null)?.respostas || 0;

  await upsertConversa(remoteJid, {
    status: 'ativa',
    respostas: respostasAnterior + 1,
    ultimo_erro: null,
  });

  console.log(`[Isabela] Respondeu ${remoteJid} (resposta #${respostasAnterior + 1}): "${resposta.substring(0, 60)}..."`);
}

// ─── Deno.serve ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = await req.json() as IsabelaPayload;

    if (!payload.remoteJid || !payload.msgId) {
      return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400 });
    }

    // Fire-and-forget: responde 200 imediatamente e processa em background
    // (o Evolution API não precisa esperar a resposta da IA)
    processarMensagem(payload).catch(e => {
      console.error('[Isabela] Erro não tratado:', e);
    });

    return new Response(JSON.stringify({ ok: true, queued: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Isabela] Erro ao processar requisição:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
