import { createRoot } from "react-dom/client";
import "./index.css";
import { GestorView } from "@/components/gestor/GestorView";
const paineis = {"gerado_em":"2026-09-23T12:00:00Z",
"compras":{"serie":[
{"mes":"2025-10","faturamento":1223013,"custo":781269,"compras":1157029,"pedidos":96},
{"mes":"2025-11","faturamento":1109010,"custo":686808,"compras":832330,"pedidos":84},
{"mes":"2025-12","faturamento":1057845,"custo":669158,"compras":258451,"pedidos":44},
{"mes":"2026-01","faturamento":1056514,"custo":657840,"compras":601685,"pedidos":66},
{"mes":"2026-02","faturamento":1170158,"custo":727715,"compras":968050,"pedidos":78},
{"mes":"2026-03","faturamento":1806963,"custo":1231262,"compras":777441,"pedidos":117},
{"mes":"2026-04","faturamento":1351064,"custo":824805,"compras":463601,"pedidos":85},
{"mes":"2026-05","faturamento":1613658,"custo":1016705,"compras":892140,"pedidos":90},
{"mes":"2026-06","faturamento":1136505,"custo":705273,"compras":540220,"pedidos":72},
{"mes":"2026-07","faturamento":1532947,"custo":975115,"compras":1010500,"pedidos":101},
{"mes":"2026-08","faturamento":1419175,"custo":916748,"compras":720300,"pedidos":88},
{"mes":"2026-09","faturamento":850176,"custo":550198,"compras":521911,"pedidos":64}],
"entradas":619650,"nfs":100,"pendente":402928,"prazo_medio":48,"abaixo_minimo":3816},
"estoque":{"total":3282955,"dias":112,"abaixo_minimo":3816,
"por_empresa":[{"emp":"001","estoque":768853,"dias":36},{"emp":"002","estoque":2251380,"dias":443},{"emp":"003","estoque":262722,"dias":96}],
"fornecedores":[{"nome":"Mexichem Brasil Ind de Transformacao Plastica","valor":333866,"dias":104},{"nome":"Top Fusion Ind. de Tubos e Conex.","valor":285777,"dias":88},{"nome":"Mexichem Brasil Ind. de Transf.","valor":268159,"dias":75},{"nome":"I.F.C. Industria e Comercio de Condutores","valor":230984,"dias":75},{"nome":"Tramontina Sudeste","valor":188741,"dias":195},{"nome":"Dexco","valor":117471,"dias":146}],
"linhas":[{"nome":"Conexões","valor":833696,"dias":134},{"nome":"Tubos","valor":539019,"dias":75},{"nome":"Cabos","valor":308428,"dias":69}]},
"cobrancas":{"vencido":453445,"a_vencer":1132070,"inadimplencia":0.11,"carteira":16591,"qtd_boletos":662,"valor_boletos":664264,
"faixas":[{"faixa":30,"vencido":8656,"a_vencer":921380,"recebido":1359598},{"faixa":60,"vencido":1956,"a_vencer":172665,"recebido":1194297},{"faixa":120,"vencido":1458,"a_vencer":38025,"recebido":2685340},{"faixa":999,"vencido":441374,"a_vencer":0,"recebido":63838208}],
"maiores_atrasos":[{"nome":"Jund Servicos em Construcao","valor":55800},{"nome":"Deconstri Construtora","valor":39462},{"nome":"R A S Opcao Construtora","valor":25176},{"nome":"JL & R Material para Construcao","valor":21123},{"nome":"Multipla Engenharia","valor":20232}]}};
const f = window.fetch;
window.fetch = (u, o) => {
  const s = String(u);
  if (s.includes("/api/gestor/paineis")) return Promise.resolve(new Response(JSON.stringify(paineis)));
  if (s.includes("/api/gestor/liberacoes")) return Promise.resolve(new Response(JSON.stringify({ pendentes: [], somenteLeitura: false })));
  if (s.includes("/api/dashboard/geral")) return Promise.resolve(new Response(JSON.stringify([])));
  if (s.includes("/rest/v1/usuarios")) return Promise.resolve(new Response(JSON.stringify([])));
  return f(u, o);
};
document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<GestorView userProfile={{ name: "Jose Mortarelli", email: "", role: "ADMIN", id: "x" }} onLogout={() => {}} />);
