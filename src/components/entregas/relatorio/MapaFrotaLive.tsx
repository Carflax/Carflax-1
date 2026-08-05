import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import {
  apiFrotaPosicoes,
  apiEntregasMapa,
  type FrotaPosicao,
  type EntregaMapa,
} from "@/lib/api";
import carflaxLogo from "@/assets/Carflax.png";

// desliza pelo CAMINHO REAL que percorreu (pontos do rastreador), nas ruas.
const POLL_MS = 10000;

// Depósito Carflax — Av. Américo Bruno, 75 · Jundiaí/SP (geocodificado).
const DEPOSITO = { lat: -23.1902, lng: -46.8694 };
const CENTRO_PADRAO: [number, number] = [DEPOSITO.lat, DEPOSITO.lng];

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c,
  );

const tempoRel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (Number.isNaN(min)) return "—";
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)}h`;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Ícone = foto redonda do motorista, anel verde (andando) / cinza (parado),
// com um selo de status: ▶ verde (em movimento) ou ❚❚ cinza (parado).
function iconeMotorista(p: FrotaPosicao): L.DivIcon {
  const moving = p.ignicao === 1 || p.velocidade > 0;
  const anel = moving ? "#10b981" : "#64748b";
  const badgeBg = moving ? "#10b981" : "#64748b";
  const badgeIcon = moving
    ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>`
    : `<svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
  const badge = `<span style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;border-radius:50%;
    background:${badgeBg};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);
    display:flex;align-items:center;justify-content:center${moving ? ";animation:frotaPulse 1.4s ease-in-out infinite" : ""}">${badgeIcon}</span>`;
  const inner = p.avatar
    ? `<img src="${esc(p.avatar)}" style="width:100%;height:100%;object-fit:cover" alt="" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#475569">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
       </div>`;
  return L.divIcon({
    className: "",
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22],
    html: `<div style="position:relative;width:42px;height:42px">
      <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;border:3px solid ${anel};
        background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.5)">${inner}</div>${badge}
    </div>`,
  });
}

// Pin do cliente/destino: âmbar (a entregar) / verde (entregue).
function iconeCliente(status: string): L.DivIcon {
  const entregue = status === "completed";
  const cor = entregue ? "#10b981" : "#f59e0b";
  return L.divIcon({
    className: "",
    iconSize: [26, 34],
    iconAnchor: [13, 32],
    popupAnchor: [0, -30],
    html: `<div style="position:relative;width:26px;height:34px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))">
      <svg width="26" height="34" viewBox="0 0 26 34"><path d="M13 0C5.8 0 0 5.8 0 13c0 9 13 21 13 21s13-12 13-21C26 5.8 20.2 0 13 0z" fill="${cor}"/></svg>
      <div style="position:absolute;top:6px;left:0;width:26px;display:flex;justify-content:center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          ${
            entregue
              ? `<polyline points="20 6 9 17 4 12"/>`
              : `<path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>`
          }
        </svg>
      </div>
    </div>`,
  });
}

function popupClienteHtml(c: EntregaMapa) {
  const entregue = c.status === "completed";
  return `
    <div style="font:400 12px/1.4 ui-sans-serif,system-ui;min-width:190px">
      <div style="font-weight:800;font-size:13px;margin-bottom:1px">${esc(c.cliente)}</div>
      <div style="color:#64748b;margin-bottom:4px">NF #${esc(c.nf)} · ${entregue ? "Entregue" : "A entregar"}</div>
      <div style="margin-bottom:2px">${esc(c.endereco)}</div>
      ${c.motorista ? `<div style="color:#64748b">Motorista: ${esc(c.motorista)}</div>` : ""}
    </div>`;
}

function popupHtml(p: FrotaPosicao) {
  const moving = p.ignicao === 1 || p.velocidade > 0;
  const estado = moving ? `${p.velocidade} km/h` : "Parado";
  return `
    <div style="font:400 12px/1.4 ui-sans-serif,system-ui;min-width:190px">
      <div style="font-weight:800;font-size:13px;margin-bottom:1px">${esc(p.motorista) || "Motorista não vinculado"}</div>
      <div style="color:#64748b;margin-bottom:4px">${esc(p.placa)}</div>
      <div style="margin-bottom:2px">${esc(p.logradouro) || "Endereço indisponível"}</div>
      <div><b>${estado}</b> · odôm. ${p.odometroKm.toLocaleString("pt-BR")} km</div>
      <div style="color:#64748b">Atualizado ${tempoRel(p.dataHora)}</div>
    </div>`;
}

export function MapaFrotaLive() {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, L.Marker>>(
    new globalThis.Map(),
  );
  const clientesRef = useRef<globalThis.Map<string, L.Marker>>(
    new globalThis.Map(),
  );
  const rafRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());
  const lastTsRef = useRef<globalThis.Map<string, string>>(
    new globalThis.Map(),
  );
  const fittedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Motor de animação: desliza o marcador ao longo de uma sequência de pontos
  // (o caminho REAL que o carro percorreu), em velocidade ~constante por distância.
  const glide = useCallback(
    (placa: string, marker: L.Marker, pontos: L.LatLng[]) => {
      const anterior = rafRef.current.get(placa);
      if (anterior) cancelAnimationFrame(anterior);
      if (pontos.length < 2) {
        if (pontos[0]) marker.setLatLng(pontos[0]);
        return;
      }
      const seg: number[] = [];
      let total = 0;
      for (let i = 1; i < pontos.length; i++) {
        const d = pontos[i - 1].distanceTo(pontos[i]);
        seg.push(d);
        total += d;
      }
      if (total === 0) {
        marker.setLatLng(pontos[pontos.length - 1]);
        return;
      }
      // ~36 km/h (10 m/s), limitado entre 3s e 22s para não travar nem lagar demais.
      const durMs = Math.min(22000, Math.max(3000, (total / 10) * 1000));
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / durMs);
        const alvo = k * total;
        let acc = 0;
        let i = 0;
        while (i < seg.length && acc + seg[i] < alvo) {
          acc += seg[i];
          i++;
        }
        if (i >= seg.length) {
          marker.setLatLng(pontos[pontos.length - 1]);
          return;
        }
        const f = seg[i] > 0 ? (alvo - acc) / seg[i] : 0;
        const a = pontos[i];
        const b = pontos[i + 1];
        marker.setLatLng([
          a.lat + (b.lat - a.lat) * f,
          a.lng + (b.lng - a.lng) * f,
        ]);
        if (k < 1) rafRef.current.set(placa, requestAnimationFrame(step));
      };
      rafRef.current.set(placa, requestAnimationFrame(step));
    },
    [],
  );

  const atualizar = useCallback(async () => {
    try {
      const { posicoes } = await apiFrotaPosicoes();
      setTotal(posicoes.length);
      const map = mapRef.current;
      if (!map) return;

      const pts: [number, number][] = [[DEPOSITO.lat, DEPOSITO.lng]];
      for (const p of posicoes) {
        if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude))
          continue;
        const ll = L.latLng(p.latitude, p.longitude);
        const trilha = p.trilha || [];
        pts.push([p.latitude, p.longitude]);
        const existente = markersRef.current.get(p.placa);

        if (existente) {
          existente.setIcon(iconeMotorista(p));
          existente.setPopupContent(popupHtml(p));

          const lastTs = lastTsRef.current.get(p.placa) || "";
          const novos = trilha.filter((pt) => String(pt.dataHora) > lastTs);
          if (novos.length > 0) {
            // Desliza pelo caminho real: posição atual → pontos novos do rastreador.
            const caminho = [
              existente.getLatLng(),
              ...novos.map((pt) => L.latLng(pt.lat, pt.lng)),
            ];
            glide(p.placa, existente, caminho);
            lastTsRef.current.set(
              p.placa,
              String(novos[novos.length - 1].dataHora),
            );
          } else if (trilha.length === 0) {
            // Sem trilha disponível: cai no deslocamento reto até a última posição.
            const cur = existente.getLatLng();
            if (
              Math.abs(cur.lat - p.latitude) > 1e-7 ||
              Math.abs(cur.lng - p.longitude) > 1e-7
            ) {
              glide(p.placa, existente, [cur, ll]);
            }
          }
        } else {
          const m = L.marker(ll, { icon: iconeMotorista(p) })
            .addTo(map)
            .bindPopup(popupHtml(p));
          markersRef.current.set(p.placa, m);
          // Não reanima o histórico no 1º load: marca o ponto mais recente como visto.
          lastTsRef.current.set(
            p.placa,
            trilha.length
              ? String(trilha[trilha.length - 1].dataHora)
              : String(p.dataHora || ""),
          );
        }
      }

      if (!fittedRef.current && pts.length > 1) {
        map.fitBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 14 });
        fittedRef.current = true;
      }
    } catch {
      /* silencioso — mantém a última posição conhecida no mapa */
    } finally {
      setLoading(false);
    }
  }, [glide]);

  // Inicializa o mapa uma vez.
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(CENTRO_PADRAO, 12);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap &copy; CARTO",
    }).addTo(map);

    // Marcador fixo do depósito Carflax (logo redonda).
    L.marker([DEPOSITO.lat, DEPOSITO.lng], {
      icon: L.divIcon({
        className: "",
        iconSize: [46, 46],
        iconAnchor: [23, 23],
        popupAnchor: [0, -24],
        html: `<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;border:3px solid #e11d2a;
          background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center">
          <img src="${carflaxLogo}" style="width:100%;height:100%;object-fit:contain" alt="Carflax" /></div>`,
      }),
    })
      .addTo(map)
      .bindPopup(
        `<div style="font:400 12px/1.4 ui-sans-serif,system-ui"><b>Carflax</b><br>Av. Américo Bruno, 75 · Jundiaí/SP</div>`,
      );

    mapRef.current = map;
    // O contêiner de tiles às vezes nasce com tamanho 0 dentro de flex/scroll.
    const fix = () => mapRef.current?.invalidateSize();
    [80, 300, 700, 1200].forEach((ms) => setTimeout(fix, ms));
    const ro = new ResizeObserver(fix);
    ro.observe(boxRef.current);

    const markers = markersRef.current;
    const clientes = clientesRef.current;
    const rafs = rafRef.current;
    const tss = lastTsRef.current;
    return () => {
      ro.disconnect();
      rafs.forEach((id) => cancelAnimationFrame(id));
      rafs.clear();
      markers.clear();
      clientes.clear();
      tss.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Clientes/destinos do romaneio de hoje (pins no mapa). Muda menos → poll lento.
  const carregarClientes = useCallback(async () => {
    try {
      const { clientes } = await apiEntregasMapa();
      const map = mapRef.current;
      if (!map) return;
      const vistos = new Set<string>();
      for (const c of clientes) {
        vistos.add(c.id);
        const existente = clientesRef.current.get(c.id);
        if (existente) {
          existente.setLatLng([c.lat, c.lng]);
          existente.setIcon(iconeCliente(c.status));
          existente.setPopupContent(popupClienteHtml(c));
        } else {
          const m = L.marker([c.lat, c.lng], { icon: iconeCliente(c.status) })
            .addTo(map)
            .bindPopup(popupClienteHtml(c));
          clientesRef.current.set(c.id, m);
        }
      }
      // Remove pins de entregas que saíram do romaneio (concluídas/excluídas).
      for (const [id, m] of clientesRef.current) {
        if (!vistos.has(id)) {
          m.remove();
          clientesRef.current.delete(id);
        }
      }
    } catch {
      /* silencioso */
    }
  }, []);

  // Polling.
  useEffect(() => {
    atualizar();
    const id = setInterval(atualizar, POLL_MS);
    return () => clearInterval(id);
  }, [atualizar]);

  useEffect(() => {
    carregarClientes();
    const id = setInterval(carregarClientes, 60000); // clientes: a cada 60s
    return () => clearInterval(id);
  }, [carregarClientes]);

  return (
    <div className="relative w-full h-full bg-[#0b1020]">
      <div ref={boxRef} className="absolute inset-0 z-0" />

      {loading && total === 0 && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-4 py-3 shadow-lg">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-xs font-black uppercase tracking-widest text-primary">
              Localizando frota…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
