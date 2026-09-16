// Ilustração de cabo na bobina e picado, na cor do cabo. Não há foto dos
// produtos no ERP; a cor sai da sigla na descrição ("... 2,5MM VD CORFIO").

const CORES: Record<string, { fio: string; brilho: string }> = {
  PT: { fio: "#1f2937", brilho: "#4b5563" },
  VD: { fio: "#16a34a", brilho: "#4ade80" },
  AZ: { fio: "#2563eb", brilho: "#60a5fa" },
  VM: { fio: "#dc2626", brilho: "#f87171" },
  BR: { fio: "#e5e7eb", brilho: "#ffffff" },
  AM: { fio: "#eab308", brilho: "#fde047" },
  MR: { fio: "#7c4a21", brilho: "#b07343" },
  CZ: { fio: "#6b7280", brilho: "#9ca3af" },
  LR: { fio: "#ea580c", brilho: "#fb923c" },
  RX: { fio: "#7c3aed", brilho: "#a78bfa" },
};
const PADRAO = { fio: "#b45309", brilho: "#f59e0b" }; // cobre, quando a cor não vem na descrição

function corDoCabo(descricao: string) {
  const sigla = /\b(PT|VD|AZ|VM|BR|AM|MR|CZ|LR|RX)\b/i.exec(descricao.toUpperCase());
  return (sigla && CORES[sigla[1]]) || PADRAO;
}

export function IlustracaoBobina({ descricao, className }: { descricao: string; className?: string }) {
  const { fio, brilho } = corDoCabo(descricao);
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden>
      {/* abas laterais do carretel */}
      <ellipse cx="30" cy="45" rx="12" ry="38" fill="#a16207" />
      <ellipse cx="30" cy="45" rx="7" ry="24" fill="#854d0e" />
      {/* cabo enrolado */}
      <rect x="30" y="17" width="60" height="56" fill={fio} />
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={i} x1={33 + i * 6.5} y1="17" x2={33 + i * 6.5} y2="73" stroke={brilho} strokeOpacity="0.55" strokeWidth="2" />
      ))}
      <ellipse cx="90" cy="45" rx="12" ry="38" fill="#ca8a04" />
      <ellipse cx="90" cy="45" rx="5" ry="15" fill="#713f12" />
      {/* ponta solta */}
      <path d="M60 73 Q 70 86 104 84" stroke={fio} strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function IlustracaoPicado({ descricao, className }: { descricao: string; className?: string }) {
  const { fio, brilho } = corDoCabo(descricao);
  const pedacos = [
    { d: "M14 70 Q 40 52 62 66 T 106 60", w: 6 },
    { d: "M20 48 Q 44 34 70 46", w: 6 },
    { d: "M58 30 Q 80 18 104 32", w: 6 },
    { d: "M30 22 Q 42 14 52 22", w: 6 },
  ];
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden>
      {pedacos.map((p, i) => (
        <g key={i}>
          <path d={p.d} stroke={fio} strokeWidth={p.w} fill="none" strokeLinecap="round" />
          <path d={p.d} stroke={brilho} strokeOpacity="0.5" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* pontas de cobre */}
      {[[14, 70], [106, 60], [20, 48], [70, 46], [58, 30], [104, 32], [30, 22], [52, 22]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="#f59e0b" />
      ))}
    </svg>
  );
}
