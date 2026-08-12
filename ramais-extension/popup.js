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
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1400);
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
    row.innerHTML = '<span class="ramal"></span><span class="nome"></span>';
    row.querySelector(".ramal").textContent = r.ramal;
    row.querySelector(".nome").textContent = r.name;
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
  const hojeBar = document.getElementById("hoje-bar");

  const diasOrdem = ["SEG", "TER", "QUA", "QUI", "SEX"];
  const dow = new Date().getDay(); // 0=dom, 1=seg...
  const hojeKey = dow >= 1 && dow <= 5 ? diasOrdem[dow - 1] : null;

  if (hojeKey) {
    const cidades = ENTREGAS[hojeKey];
    hojeBar.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
      "Hoje (" + DIAS_LABELS[hojeKey] + "): " + cidades.join(", ");
    hojeBar.className = "hoje-indicator";
  }

  const maxRows = Math.max(...diasOrdem.map((d) => ENTREGAS[d].length));

  let html = "";
  for (const dia of diasOrdem) {
    const isHoje = dia === hojeKey;
    html += '<div class="dia-col">';
    html += '<div class="dia-header"' + (isHoje ? ' style="background:#16a34a"' : '') + '>' + DIAS_LABELS[dia].substring(0, 3).toUpperCase() + '</div>';
    const cidades = ENTREGAS[dia];
    for (let i = 0; i < maxRows; i++) {
      if (i < cidades.length) {
        html += '<div class="dia-city' + (isHoje ? ' destaque' : '') + '">' + escapeHtml(cidades[i]) + '</div>';
      } else {
        html += '<div class="dia-city"></div>';
      }
    }
    html += '</div>';
  }
  grid.innerHTML = html;
}

renderEntregas();

// ===================== FRETES =====================

const qfEl = document.getElementById("qf");

function renderFretes(lista) {
  const container = document.getElementById("fretes-container");
  if (!lista.length) {
    container.innerHTML = '<div class="empty">Nenhuma cidade encontrada.</div>';
    return;
  }
  let html = '<table class="fretes-table"><thead><tr><th>Cidade</th><th>Pedido Min.</th><th>Frete</th></tr></thead><tbody>';
  for (const f of lista) {
    html += "<tr><td>" + escapeHtml(f.cidade) + "</td><td>" + moeda(f.minimo) + "</td><td>" + moeda(f.frete) + "</td></tr>";
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
