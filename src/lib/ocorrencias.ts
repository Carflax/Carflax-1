// Tipos de ocorrência de entrega — fonte única compartilhada entre a tela do
// motorista (registro) e a subcategoria Ocorrências em Entregas (tratamento).
export interface TipoOcorrencia {
  /** valor gravado em entregas_ocorrencias.tipo */
  value: string;
  label: string;
  /** sugere marcar a entrega como não realizada ao registrar */
  bloqueiaPadrao: boolean;
}

export const TIPOS_OCORRENCIA: TipoOcorrencia[] = [
  { value: "cliente_ausente", label: "Cliente ausente", bloqueiaPadrao: true },
  { value: "endereco_nao_localizado", label: "Endereço não localizado", bloqueiaPadrao: true },
  { value: "recusa", label: "Cliente recusou a mercadoria", bloqueiaPadrao: true },
  { value: "avaria", label: "Mercadoria avariada", bloqueiaPadrao: false },
  { value: "divergencia", label: "Divergência de produto / quantidade", bloqueiaPadrao: false },
  { value: "local_fechado", label: "Local fechado / fora do horário", bloqueiaPadrao: true },
  { value: "acesso_restrito", label: "Acesso restrito ao local", bloqueiaPadrao: true },
  { value: "veiculo", label: "Problema no veículo", bloqueiaPadrao: false },
  { value: "transito", label: "Trânsito / acidente na rota", bloqueiaPadrao: false },
  { value: "outro", label: "Outro", bloqueiaPadrao: false },
];

export function labelOcorrencia(tipo: string): string {
  return TIPOS_OCORRENCIA.find(t => t.value === tipo)?.label || tipo;
}
