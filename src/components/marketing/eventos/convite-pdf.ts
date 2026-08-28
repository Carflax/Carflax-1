import jsPDF from "jspdf";
import type { Evento, EventoFornecedor, EventoConvidado } from "./types";
import { formatBRL, formatDate, formatHora } from "./types";

// ─── Constantes visuais (mesma paleta do orcamento-pdf) ──────────────────────
const AZUL: [number, number, number] = [23, 37, 84];
const AZUL_CLARO: [number, number, number] = [37, 99, 235];
const CINZA: [number, number, number] = [240, 242, 245];
const BORDA: [number, number, number] = [190, 200, 215];
const TEXTO: [number, number, number] = [20, 20, 20];
const LABEL: [number, number, number] = [80, 80, 80];

const MARGEM = 18;
const LARGURA = 210;
const UTIL = LARGURA - MARGEM * 2;

// Prazo de pagamento da cota, definido no plano de ação. Fica aqui em vez de
// espalhado pelo texto: já mudou uma vez (era 30/09) e deve mudar de novo.
const PRAZO_COTA = "30/08/2026";

// Nome de arquivo seguro: sem acento, espaço ou caractere que o SO rejeite.
function slug(s: string) {
  return s
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "convite";
}

function cabecalho(doc: jsPDF, evento: Evento, etiqueta: string) {
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, LARGURA, 38, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(evento.nome.toUpperCase(), MARGEM, 16);

  if (evento.subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const sub = doc.splitTextToSize(evento.subtitulo, UTIL);
    doc.text(sub[0], MARGEM, 23);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(etiqueta.toUpperCase(), MARGEM, 32);

  doc.setTextColor(...TEXTO);
  return 48;
}

// Bloco com data / horário / local — igual nos dois convites.
function blocoQuando(doc: jsPDF, evento: Evento, y: number) {
  doc.setFillColor(...CINZA);
  doc.setDrawColor(...BORDA);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGEM, y, UTIL, 18, 2, 2, "FD");

  const col = UTIL / 3;
  const itens: [string, string][] = [
    ["DATA", formatDate(evento.data_evento)],
    ["HORÁRIO", evento.hora_inicio ? `${formatHora(evento.hora_inicio)} às ${formatHora(evento.hora_fim)}` : "—"],
    ["LOCAL", evento.local || "—"],
  ];
  itens.forEach(([lab, val], i) => {
    const x = MARGEM + col * i + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...LABEL);
    doc.text(lab, x, y + 6.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...TEXTO);
    doc.text(doc.splitTextToSize(val, col - 6)[0], x, y + 13);
  });
  return y + 26;
}

function titulo(doc: jsPDF, texto: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...AZUL);
  doc.text(texto.toUpperCase(), MARGEM, y);
  doc.setDrawColor(...AZUL_CLARO);
  doc.setLineWidth(0.5);
  doc.line(MARGEM, y + 1.5, MARGEM + 22, y + 1.5);
  doc.setTextColor(...TEXTO);
  return y + 8;
}

// Item "rótulo + descrição" com quebra automática. Devolve o novo y.
function item(doc: jsPDF, rotulo: string, descricao: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...AZUL_CLARO);
  doc.text("•", MARGEM, y);
  doc.setTextColor(...TEXTO);
  doc.text(rotulo, MARGEM + 4, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  const linhas = doc.splitTextToSize(descricao, UTIL - 4);
  doc.text(linhas, MARGEM + 4, y + 4.5);
  doc.setTextColor(...TEXTO);
  return y + 4.5 + linhas.length * 4 + 3;
}

function rodape(doc: jsPDF, texto: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...LABEL);
  doc.text(texto, MARGEM, 288);
  doc.setTextColor(...TEXTO);
}

// ─── Convite do fornecedor (media kit) ───────────────────────────────────────
// Mostra a cota DAQUELE fornecedor — é a condição negociada com ele. As
// condições são individuais e nunca divulgadas entre fornecedores, então este
// PDF é endereçado a uma marca só e não pode ser repassado a outra.
export function gerarConviteFornecedor(evento: Evento, f: EventoFornecedor) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = cabecalho(doc, evento, "Convite a Fornecedor · Media Kit");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(f.marca, MARGEM, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...LABEL);
  const publico = `Público estimado: ${evento.publico_meta_min}–${evento.publico_meta_max} instaladores hidráulicos e eletricistas.`;
  doc.text(publico, MARGEM, y);
  doc.setTextColor(...TEXTO);
  y += 10;

  y = blocoQuando(doc, evento, y);
  y = titulo(doc, "O que pedimos", y);

  y = item(doc, `Verba de participação — ${formatBRL(f.cota_valor)}`,
    `Verba cooperada / trade marketing, com pagamento até ${PRAZO_COTA}.`, y);

  y = item(doc, `Brindes para o Kit Instalador — mínimo de ${evento.brindes_meta} unidades`,
    "Itens úteis ao instalador (boné, camiseta, trena, chave de fenda etc.) para compor o Kit Instalador entregue na entrada.", y);

  y = item(doc, `Prêmio para sorteio — 1 item${f.premio_valor ? ` (valor sugerido ${formatBRL(f.premio_valor)})` : " de maior valor"}`,
    f.premio_descricao?.trim()
      ? f.premio_descricao
      : "Furadeira, ducha premium, kit de ferramentas ou similar. Valor mínimo sugerido de R$ 200,00.", y);

  const janela = evento.hora_inicio ? ` (${formatHora(evento.hora_inicio)} às ${formatHora(evento.hora_fim)})` : "";
  y = item(doc, `Promotor técnico — 1 profissional presente${janela}`,
    "Demonstração prática de produto (instalação de ducha, emenda de cabo, solda de tubo etc.).", y);

  y = item(doc, "Estrutura de exposição — por conta da marca",
    "Banner, inflável, mesa ou stand próprios. Montagem na véspera (14/10). Custo zero para a Carflax.", y);

  if (f.apoio_master) {
    y += 2;
    doc.setFillColor(...CINZA);
    doc.setDrawColor(...AZUL_CLARO);
    doc.roundedRect(MARGEM, y, UTIL, 14, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...AZUL);
    doc.text("APOIO MASTER", MARGEM + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...LABEL);
    doc.text("Melhor posição de stand, demonstração no horário de pico do evento, logo em destaque no material gráfico e citação na abertura.", MARGEM + 4, y + 11, { maxWidth: UTIL - 8 });
    doc.setTextColor(...TEXTO);
    y += 20;
  }

  y = titulo(doc, "Prazos", y + 2);
  y = item(doc, "Confirmação até 31/08/2026",
    "Quem confirma primeiro escolhe a posição do stand.", y);
  y = item(doc, `Cota paga até ${PRAZO_COTA}`,
    "Para viabilizar buffet, estrutura e materiais gráficos com antecedência.", y);

  rodape(doc, "Documento endereçado exclusivamente a " + f.marca + ". As condições de participação são negociadas individualmente com cada parceiro e não devem ser compartilhadas entre fornecedores.");

  doc.save(`convite-fornecedor-${slug(f.marca)}.pdf`);
}

// ─── Convite do cliente ──────────────────────────────────────────────────────
// Sem confirmação não há voucher nem número da sorte — o PDF então funciona
// como convite, e não como ingresso.
export function gerarConviteCliente(evento: Evento, c: EventoConvidado) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = cabecalho(doc, evento, "Convite ao Instalador");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LABEL);
  doc.text("Convite nominal para", MARGEM, y);
  doc.setTextColor(...TEXTO);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(c.nome.toUpperCase(), MARGEM, y);
  y += 10;

  y = blocoQuando(doc, evento, y);
  y = titulo(doc, "O que você recebe", y);

  y = item(doc, "Refeição reforçada com o nosso buffet",
    "No fim do expediente, depois de concluir os serviços do dia — no horário em que você já passa na Carflax.", y);
  y = item(doc, "Kit Instalador na entrada",
    "Com brindes das marcas participantes — exclusivo para quem confirmou presença.", y);
  y = item(doc, "2 grandes sorteios exclusivos para os presentes",
    "Kit Completo do Eletricista e Kit Completo do Encanador, com ferramentas e acessórios profissionais, montados em parceria com os fornecedores.", y);
  y = item(doc, "Demonstrações técnicas",
    "Novidades de produto de cada marca, com demonstração prática.", y);
  y = item(doc, `Condição comercial exclusiva — válida somente no dia ${formatDate(evento.data_evento).slice(0, 5)}`,
    "Aproveite para levar o material da obra com condição especial no balcão.", y);

  y += 4;

  // Voucher
  if (c.status === "confirmado" && c.voucher_numero) {
    doc.setFillColor(...AZUL);
    doc.roundedRect(MARGEM, y, UTIL, 30, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("VOUCHER NOMINAL — APRESENTE NA ENTRADA", MARGEM + 6, y + 8);

    doc.setFontSize(14);
    doc.text(c.voucher_numero, MARGEM + 6, y + 18);

    doc.setFontSize(7);
    doc.text("SEU NÚMERO DA SORTE", MARGEM + UTIL - 48, y + 8);
    doc.setFontSize(24);
    doc.text(String(c.numero_sorteio ?? "—"), MARGEM + UTIL - 48, y + 21);

    doc.setTextColor(...TEXTO);
    y += 36;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...LABEL);
    doc.text("É necessário estar presente para retirar o prêmio. Os sorteios acontecem ao longo do evento.", MARGEM, y);
    doc.setTextColor(...TEXTO);
    y += 8;
  } else {
    doc.setFillColor(...CINZA);
    doc.setDrawColor(...BORDA);
    doc.roundedRect(MARGEM, y, UTIL, 22, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...AZUL);
    doc.text("CONFIRME SUA PRESENÇA", MARGEM + 6, y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...LABEL);
    doc.text("Ao confirmar, você recebe um voucher nominal com o seu número da sorte. Sem confirmação não há kit nem número.", MARGEM + 6, y + 15, { maxWidth: UTIL - 12 });
    doc.setTextColor(...TEXTO);
    y += 28;
  }

  if (c.vendedor_nome) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Seu contato na Carflax: ${c.vendedor_nome}`, MARGEM, y);
  }

  rodape(doc, `Convite pessoal e intransferível · ${evento.local || ""}`);

  doc.save(`convite-${slug(c.nome)}.pdf`);
}
