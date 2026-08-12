// Carflax Hub — popup com abas: Ramais, Entregas, Fretes

const SUPABASE_URL = "https://zwfvrmqffxcqurxpfewi.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3ZnZybXFmZnhjcXVyeHBmZXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDMwMzksImV4cCI6MjA5MjAxOTAzOX0.6Q02L0XYE7xWtn0AcCwN2KDTvRaYQgGwoTPLblR-VgE";

// ===================== DADOS ESTÁTICOS =====================

let ENTREGAS = {
  "SEG": ["Jundiaí", "Várzea Pta", "Campo Limpo Pta", "Jarinu", "Atibaia", "Cabreúva"],
  "TER": ["Jundiaí", "Vinhedo", "Campinas", "Valinhos", "Louveira", "Itatiba", "São Paulo"],
  "QUA": ["Jundiaí", "Várzea Pta", "Campo Limpo Pta", "Jarinu", "Atibaia", "Itupeva", "Cabreúva", "São Paulo"],
  "QUI": ["Jundiaí", "Vinhedo", "Campinas", "Valinhos", "Louveira", "Itatiba", "São Paulo"],
  "SEX": ["Jundiaí", "Vinhedo", "Várzea Pta", "Campo Limpo Pta", "Jarinu", "Atibaia", "Itupeva", "Cabreúva"]
};

const DIAS_LABELS = {
  "SEG": "Segunda",
  "TER": "Terça",
  "QUA": "Quarta",
  "QUI": "Quinta",
  "SEX": "Sexta"
};

let FRETES = [
  { cidade: "Jundiaí",         minimo: 500,  frete: 40  },
  { cidade: "Vinhedo",         minimo: 600,  frete: 60  },
  { cidade: "Valinhos",        minimo: 1300, frete: 100 },
  { cidade: "Itupeva",         minimo: 600,  frete: 60  },
  { cidade: "Várzea Pta",      minimo: 500,  frete: 35  },
  { cidade: "Campo Limpo Pta", minimo: 500,  frete: 40  },
  { cidade: "Louveira",        minimo: 500,  frete: 40  },
  { cidade: "Jarinu",          minimo: 800,  frete: 70  },
  { cidade: "Cabreúva",        minimo: 1300, frete: 100 },
  { cidade: "Franco da Rocha", minimo: 850,  frete: 50  },
  { cidade: "São Paulo",       minimo: 2000, frete: 150 },
  { cidade: "Campinas",        minimo: 1600, frete: 150 },
  { cidade: "Atibaia",         minimo: 2000, frete: 100 },
  { cidade: "Itu",             minimo: 1800, frete: 150 },
  { cidade: "Itatiba",         minimo: 1000, frete: 90  }
];

// ===================== UTILITÁRIOS =====================

const PARTICULAS = new Set(["de", "da", "do", "dos", "das", "e"]);
function nomeCurto(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  const segundo = parts.slice(1).find((p) => !PARTICULAS.has(p.toLowerCase()));
  return segundo ? `${parts[0]} ${segundo}` : parts[0];
}

function moeda(valor) {
  return "R$ " + valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizarEntregas(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const dias = ["SEG", "TER", "QUA", "QUI", "SEX"];
  return Object.fromEntries(dias.map((dia) => [
    dia,
    Array.isArray(value[dia])
      ? value[dia].filter((cidade) => typeof cidade === "string" && cidade.trim()).map((cidade) => cidade.trim())
      : [],
  ]));
}

function normalizarFretes(value) {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item) => item && typeof item.cidade === "string" && item.cidade.trim())
    .map((item) => ({ cidade: item.cidade.trim(), minimo: Number(item.minimo) || 0, frete: Number(item.frete) || 0 }));
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" style="width:16px;height:16px"><polyline points="20 6 9 17 4 12"/></svg>' + escapeHtml(msg);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// ===================== TABS =====================

const tabBtns = document.querySelectorAll(".tabs button");
const tabPanes = document.querySelectorAll(".tab-content");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabPanes.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + target).classList.add("active");

    if (target === "ramais") {
      const q = document.getElementById("q");
      if (q) q.focus();
    }
    if (target === "fretes") {
      const qf = document.getElementById("qf");
      if (qf) qf.focus();
    }
  });
});

// ===================== RAMAIS =====================

const listEl = document.getElementById("list");
const countEl = document.getElementById("count");
const qEl = document.getElementById("q");
let ramais = [];

function renderRamais(items) {
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">Nenhum ramal encontrado.</div>';
    return;
  }
  listEl.innerHTML = "";
  for (const r of items) {
    const row = document.createElement("div");
    row.className = "row";
    row.title = "Clique para copiar o ramal " + r.ramal;
    
    const initial = r.name ? r.name.charAt(0).toUpperCase() : "?";

    row.innerHTML = `
      <div class="row-left">
        <div class="avatar">${initial}</div>
        <span class="nome">${escapeHtml(r.name)}</span>
      </div>
      <div class="ramal-badge">
        <span class="ramal">${escapeHtml(r.ramal)}</span>
        <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
      </div>
    `;
    row.addEventListener("click", () => {
      navigator.clipboard.writeText(r.ramal).then(() => toast("Ramal " + r.ramal + " copiado"));
    });
    listEl.appendChild(row);
  }
}

function filtrarRamais() {
  const q = qEl.value.trim().toLowerCase();
  const filtrados = q
    ? ramais.filter((r) => r.name.toLowerCase().includes(q) || r.ramal.includes(q))
    : ramais;
  renderRamais(filtrados);
}

function setRamais(list) {
  ramais = list;
  countEl.textContent = list.length ? list.length + " ramais" : "";
  filtrarRamais();
}

async function carregarRamais() {
  try {
    const cache = await chrome.storage.local.get("ramais");
    if (cache.ramais && cache.ramais.length) setRamais(cache.ramais);
  } catch (_) {}

  try {
    const url =
      SUPABASE_URL +
      "/rest/v1/usuarios?select=name,ramal&ramal=not.is.null&order=name.asc";
    const res = await fetch(url, {
      headers: { apikey: ANON_KEY, authorization: "Bearer " + ANON_KEY },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const list = data
      .filter((x) => x.ramal && String(x.ramal).trim() !== "")
      .map((x) => ({ ramal: String(x.ramal).trim(), name: nomeCurto(x.name || "") }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setRamais(list);
    chrome.storage.local.set({ ramais: list, updatedAt: Date.now() });
  } catch (err) {
    if (!ramais.length) {
      listEl.innerHTML =
        '<div class="err">Não foi possível carregar os ramais.<br>Verifique a conexão e tente de novo.</div>';
    }
  }
}

qEl.addEventListener("input", filtrarRamais);
carregarRamais();

async function carregarConfiguracoes() {
  try {
    const query = new URLSearchParams({
      select: "key,value",
      key: "in.(extensao_entregas,extensao_fretes)",
    });
    const res = await fetch(SUPABASE_URL + "/rest/v1/crm_config?" + query, {
      headers: { apikey: ANON_KEY, authorization: "Bearer " + ANON_KEY },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const config = await res.json();
    for (const item of config) {
      let value;
      try {
        value = typeof item.value === "string" ? JSON.parse(item.value) : item.value;
      } catch (_) {
        continue;
      }
      if (item.key === "extensao_entregas") {
        const entregas = normalizarEntregas(value);
        if (entregas) ENTREGAS = entregas;
      }
      if (item.key === "extensao_fretes") {
        const fretes = normalizarFretes(value);
        if (fretes) FRETES = fretes;
      }
    }
  } catch (_) {
    // Mantem os valores padrao quando a extensao estiver offline.
  }
  renderEntregas();
  filtrarFretes();
}

// ===================== ENTREGAS =====================

function renderEntregas() {
  const grid = document.getElementById("entregas-grid");

  const diasOrdem = ["SEG", "TER", "QUA", "QUI", "SEX"];
  const dow = new Date().getDay(); // 0=dom, 1=seg...
  const hojeKey = dow >= 1 && dow <= 5 ? diasOrdem[dow - 1] : null;

  const maxRows = Math.max(...diasOrdem.map((d) => ENTREGAS[d].length));

  let html = "";
  for (const dia of diasOrdem) {
    const isHoje = dia === hojeKey;
    html += '<div class="dia-col' + (isHoje ? ' is-hoje' : '') + '">';
    html += '<div class="dia-header' + (isHoje ? ' header-hoje' : '') + '">';
    html += '<span>' + DIAS_LABELS[dia].substring(0, 3).toUpperCase() + '</span>';
    if (isHoje) html += '<span class="hoje-tag">Hoje</span>';
    html += '</div>';
    html += '<div class="dia-cities-wrapper">';
    const cidades = ENTREGAS[dia];
    for (let i = 0; i < maxRows; i++) {
      if (i < cidades.length) {
        html += '<div class="dia-city' + (isHoje ? ' destaque' : '') + '" title="' + escapeHtml(cidades[i]) + '">' + escapeHtml(cidades[i]) + '</div>';
      } else {
        html += '<div class="dia-city empty-cell"></div>';
      }
    }
    html += '</div></div>';
  }
  grid.innerHTML = html;
}

renderEntregas();

// ===================== FRETES =====================

const qfEl = document.getElementById("qf");

function renderFretes(lista) {
  const container = document.getElementById("fretes-container");
  if (!lista.length) {
    container.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px;margin:0 auto 8px;opacity:0.5;display:block"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>Nenhuma cidade encontrada.</div>';
    return;
  }
  let html = '<table class="fretes-table"><thead><tr><th>CIDADE</th><th style="text-align:right">PEDIDO MÍN.</th><th style="text-align:right">FRETE</th></tr></thead><tbody>';
  for (const f of lista) {
    html += "<tr>" +
      '<td><div class="cidade-cell"><div class="city-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>' + escapeHtml(f.cidade) + "</div></td>" +
      '<td style="text-align:right"><span class="badge-minimo">' + moeda(f.minimo) + "</span></td>" +
      '<td style="text-align:right"><span class="badge-frete">' + moeda(f.frete) + "</span></td>" +
      "</tr>";
  }
  html += "</tbody></table>";
  container.innerHTML = html;
}

function filtrarFretes() {
  const q = qfEl.value.trim().toLowerCase();
  const filtrados = q
    ? FRETES.filter((f) => f.cidade.toLowerCase().includes(q))
    : FRETES;
  renderFretes(filtrados);
}

qfEl.addEventListener("input", filtrarFretes);
carregarConfiguracoes();
