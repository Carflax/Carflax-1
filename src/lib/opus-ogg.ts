/**
 * Remux de WebM/Opus para Ogg/Opus, no navegador.
 *
 * Por que isto existe: o MediaRecorder do Chrome não grava Ogg (`audio/ogg`
 * volta como não suportado) e o `audio/mp4` que ele oferece sai FRAGMENTADO —
 * com caixas `moof`/`mdat`, formato de streaming. O WhatsApp aceita a chamada da
 * API, busca o arquivo e falha ao processar: a mensagem fica `failed` e o
 * cliente nunca recebe. Todo áudio que chega de cliente é `audio/ogg`, que é o
 * formato nativo de nota de voz.
 *
 * O WebM que o Chrome grava já carrega quadros OPUS — os mesmos que o Ogg usa.
 * Então aqui não há recodificação: só se troca o container, o que é rápido
 * (milissegundos), não perde qualidade e não adiciona dependência ao projeto.
 *
 * Escopo deliberado: lê apenas o necessário do Matroska (CodecPrivate e os
 * blocos de áudio) em vez de um parser completo — é um arquivo que nós mesmos
 * acabamos de gravar, com uma trilha só.
 */

// ─── Leitura do WebM (Matroska/EBML) ─────────────────────────────────────────

interface LeitorEbml {
  dados: Uint8Array;
  pos: number;
}

/** ID do elemento: o comprimento vem no primeiro bit ligado do primeiro byte. */
function lerIdElemento(r: LeitorEbml): number | null {
  if (r.pos >= r.dados.length) return null;
  const primeiro = r.dados[r.pos];
  let tamanho = 0;
  for (let i = 0; i < 4; i++) {
    if (primeiro & (0x80 >> i)) {
      tamanho = i + 1;
      break;
    }
  }
  if (tamanho === 0 || r.pos + tamanho > r.dados.length) return null;
  let id = 0;
  for (let i = 0; i < tamanho; i++) id = (id << 8) | r.dados[r.pos + i];
  r.pos += tamanho;
  return id >>> 0;
}

/** Tamanho do elemento (VINT). `null` = tamanho desconhecido (elemento aberto). */
function lerTamanho(r: LeitorEbml): number | null {
  if (r.pos >= r.dados.length) return null;
  const primeiro = r.dados[r.pos];
  let largura = 0;
  for (let i = 0; i < 8; i++) {
    if (primeiro & (0x80 >> i)) {
      largura = i + 1;
      break;
    }
  }
  if (largura === 0 || r.pos + largura > r.dados.length) return null;

  let valor = primeiro & (0xff >> largura);
  let desconhecido = valor === (0xff >> largura);
  for (let i = 1; i < largura; i++) {
    const b = r.dados[r.pos + i];
    if (b !== 0xff) desconhecido = false;
    valor = valor * 256 + b;
  }
  r.pos += largura;
  // Cluster com tamanho desconhecido é comum em gravação ao vivo: seguimos
  // lendo os filhos até o próximo elemento de nível superior.
  return desconhecido ? null : valor;
}

const ID_SEGMENT = 0x18538067;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_CODEC_PRIVATE = 0x63a2;
const ID_CLUSTER = 0x1f43b675;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK_GROUP = 0xa0;
const ID_BLOCK = 0xa1;

/** Elementos cujo conteúdo precisamos percorrer, em vez de pular. */
const CONTAINERS = new Set([ID_SEGMENT, ID_TRACKS, ID_TRACK_ENTRY, ID_CLUSTER, ID_BLOCK_GROUP]);

interface ConteudoWebm {
  cabecalhoOpus: Uint8Array | null;
  pacotes: Uint8Array[];
}

/** Extrai o OpusHead (CodecPrivate) e os pacotes Opus, na ordem. */
function extrairDoWebm(dados: Uint8Array): ConteudoWebm {
  const r: LeitorEbml = { dados, pos: 0 };
  const resultado: ConteudoWebm = { cabecalhoOpus: null, pacotes: [] };

  while (r.pos < dados.length) {
    const id = lerIdElemento(r);
    if (id === null) break;
    const tamanho = lerTamanho(r);
    if (tamanho === null && !CONTAINERS.has(id)) break;

    if (CONTAINERS.has(id)) {
      continue; // desce para os filhos
    }

    const inicio = r.pos;
    const fim = Math.min(inicio + (tamanho as number), dados.length);

    if (id === ID_CODEC_PRIVATE && !resultado.cabecalhoOpus) {
      resultado.cabecalhoOpus = dados.subarray(inicio, fim);
    } else if (id === ID_SIMPLE_BLOCK || id === ID_BLOCK) {
      const pacote = extrairPacoteDoBloco(dados, inicio, fim);
      if (pacote) resultado.pacotes.push(pacote);
    }

    r.pos = fim;
  }

  return resultado;
}

/**
 * Payload de um SimpleBlock/Block: número da trilha (VINT), timecode (2 bytes),
 * flags (1 byte) e o quadro. Lacing é ignorado de propósito — o Opus do
 * MediaRecorder sai com um pacote por bloco, e tratar os quatro modos de lacing
 * seria código sem uso real aqui.
 */
function extrairPacoteDoBloco(dados: Uint8Array, inicio: number, fim: number): Uint8Array | null {
  const r: LeitorEbml = { dados, pos: inicio };
  const trilha = lerTamanho(r); // mesma codificação VINT
  if (trilha === null) return null;
  const depoisDoCabecalho = r.pos + 3; // timecode (2) + flags (1)
  if (depoisDoCabecalho >= fim) return null;
  return dados.subarray(depoisDoCabecalho, fim);
}

// ─── Duração de um pacote Opus (para o granule position) ─────────────────────

/** Milissegundos por quadro, indexado pelo `config` (5 bits altos do TOC). */
const MS_POR_CONFIG = [
  10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 40, 60, // SILK NB/MB/WB
  10, 20, 10, 20, // Híbrido SWB/FB
  2.5, 5, 10, 20, 2.5, 5, 10, 20, // CELT NB/WB
  2.5, 5, 10, 20, 2.5, 5, 10, 20, // CELT SWB/FB
];

/** Amostras a 48 kHz que o pacote representa — é isso que o Ogg contabiliza. */
function amostrasDoPacoteOpus(pacote: Uint8Array): number {
  if (pacote.length === 0) return 0;
  const toc = pacote[0];
  const ms = MS_POR_CONFIG[toc >> 3] ?? 20;
  const c = toc & 0x03;

  let quadros: number;
  if (c === 0) quadros = 1;
  else if (c === 1 || c === 2) quadros = 2;
  else quadros = pacote.length > 1 ? pacote[1] & 0x3f : 1; // modo arbitrário

  return Math.round(ms * 48 * Math.max(1, quadros));
}

// ─── Escrita do Ogg ──────────────────────────────────────────────────────────

/** CRC-32 do Ogg: polinômio 0x04c11db7, sem reflexão e sem xor final. */
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
    t[i] = r >>> 0;
  }
  return t;
})();

function crcOgg(dados: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < dados.length; i++) {
    crc = ((crc << 8) ^ TABELA_CRC[((crc >>> 24) ^ dados[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

function montarPagina(
  pacotes: Uint8Array[],
  tipoCabecalho: number,
  granule: number,
  serial: number,
  sequencia: number,
): Uint8Array {
  const tabela: number[] = [];
  for (const p of pacotes) {
    let restante = p.length;
    while (restante >= 255) {
      tabela.push(255);
      restante -= 255;
    }
    tabela.push(restante); // um lacing < 255 fecha o pacote
  }

  const corpo = pacotes.reduce((n, p) => n + p.length, 0);
  const pagina = new Uint8Array(27 + tabela.length + corpo);
  const dv = new DataView(pagina.buffer);

  pagina.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  pagina[4] = 0; // versão
  pagina[5] = tipoCabecalho;
  // granule é de 64 bits; áudio de conversa não chega perto de 2^32 amostras,
  // então a parte alta fica zerada.
  dv.setUint32(6, granule >>> 0, true);
  dv.setUint32(10, Math.floor(granule / 0x100000000), true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, sequencia, true);
  dv.setUint32(22, 0, true); // CRC entra depois, com o campo zerado
  pagina[26] = tabela.length;
  pagina.set(tabela, 27);

  let off = 27 + tabela.length;
  for (const p of pacotes) {
    pagina.set(p, off);
    off += p.length;
  }

  dv.setUint32(22, crcOgg(pagina), true);
  return pagina;
}

const OPUS_TAGS = (() => {
  const vendor = new TextEncoder().encode("Carflax HUB");
  const buf = new Uint8Array(8 + 4 + vendor.length + 4);
  buf.set(new TextEncoder().encode("OpusTags"), 0);
  const dv = new DataView(buf.buffer);
  dv.setUint32(8, vendor.length, true);
  buf.set(vendor, 12);
  dv.setUint32(12 + vendor.length, 0, true); // sem comentários
  return buf;
})();

/** OpusHead mínimo, para quando o WebM não trouxer CodecPrivate. */
function cabecalhoOpusPadrao(canais = 1): Uint8Array {
  const buf = new Uint8Array(19);
  buf.set(new TextEncoder().encode("OpusHead"), 0);
  buf[8] = 1; // versão
  buf[9] = canais;
  const dv = new DataView(buf.buffer);
  dv.setUint16(10, 3840, true); // pre-skip padrão do libopus
  dv.setUint32(12, 48000, true);
  dv.setUint16(16, 0, true); // ganho
  buf[18] = 0; // mapeamento de canais
  return buf;
}

const MAX_SEGMENTOS_POR_PAGINA = 255;
const ALVO_BYTES_POR_PAGINA = 4096;

/**
 * Converte a gravação WebM/Opus do MediaRecorder em um arquivo Ogg/Opus.
 * Devolve `null` quando o blob não tem Opus reconhecível — aí o chamador decide
 * se envia o original ou avisa o usuário.
 */
export async function webmOpusParaOgg(blob: Blob): Promise<Blob | null> {
  const dados = new Uint8Array(await blob.arrayBuffer());
  const { cabecalhoOpus, pacotes } = extrairDoWebm(dados);
  if (pacotes.length === 0) return null;

  const serial = (Math.random() * 0xffffffff) >>> 0;
  const paginas: Uint8Array[] = [];
  let sequencia = 0;

  // Cabeçalhos: cada um em sua própria página, como manda o mapeamento Opus.
  paginas.push(montarPagina([cabecalhoOpus ?? cabecalhoOpusPadrao()], 0x02, 0, serial, sequencia++));
  paginas.push(montarPagina([OPUS_TAGS], 0x00, 0, serial, sequencia++));

  let granule = 0;
  let lote: Uint8Array[] = [];
  let bytesNoLote = 0;
  let segmentosNoLote = 0;

  const fecharLote = (ultima: boolean) => {
    if (lote.length === 0) return;
    paginas.push(montarPagina(lote, ultima ? 0x04 : 0x00, granule, serial, sequencia++));
    lote = [];
    bytesNoLote = 0;
    segmentosNoLote = 0;
  };

  for (let i = 0; i < pacotes.length; i++) {
    const p = pacotes[i];
    const segmentos = Math.floor(p.length / 255) + 1;

    if (
      lote.length > 0 &&
      (segmentosNoLote + segmentos > MAX_SEGMENTOS_POR_PAGINA ||
        bytesNoLote + p.length > ALVO_BYTES_POR_PAGINA)
    ) {
      fecharLote(false);
    }

    lote.push(p);
    bytesNoLote += p.length;
    segmentosNoLote += segmentos;
    // O granule da página é o total de amostras até o fim do último pacote dela.
    granule += amostrasDoPacoteOpus(p);

    if (i === pacotes.length - 1) fecharLote(true);
  }

  const total = paginas.reduce((n, p) => n + p.length, 0);
  const saida = new Uint8Array(total);
  let off = 0;
  for (const p of paginas) {
    saida.set(p, off);
    off += p.length;
  }

  return new Blob([saida], { type: "audio/ogg" });
}
