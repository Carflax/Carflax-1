// Dashboard Right Panel Components
import { taxaConversaoValor } from "@/lib/crm-service";
import {
  Gift,
  Target,
  ArrowDownRight,
  Clock,
  DollarSign,
  TrendingUp,
  Calendar,
  Zap,
  PieChart,
  MoreHorizontal,
  BarChart3,
  Users,
  Flag,
  Trophy,
  AlertCircle,
  Plane,
  Sun,
  Star,
  Activity,
  X,
  Camera,
  LayoutGrid,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { cn, formatTeamName } from "@/lib/utils";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas-pro";
import { uploadImage } from "@/lib/uploadImage";
import { apiDashboardGeral, type VendedorResumo, apiEntregasConcluidas, apiCampanhaMetas, apiVendasDiarias, type VendaDiaria, apiDashboardMetas } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { calculateMonthlyWinner } from "@/lib/highlights_automation";
import { supabase } from "@/lib/supabase";

interface UserProfileLite {
  id?: string;
  operator_code?: string;
  operatorCode?: string;
  name?: string;
  avatar?: string;
  role?: string;
  department?: string;
  phone?: string;
  whatsapp?: string;
  is_leader?: boolean;
}

// Usuário vindo do Supabase para montar a hierarquia (Diretor → Supervisores → Vendedores)
interface OrgUser {
  id: string;
  operator_code?: string | null;
  name?: string | null;
  role?: string | null;
  responsavel_id?: string | null;
  is_leader?: boolean | null;
}

// Soma as métricas de um conjunto de vendedores em uma única linha agregada.
// Usado para o total "Meu Time" (supervisor) e para os subtotais por time na
// visão do Diretor. Recalcula todos os campos exibidos — não pode herdar da
// linha da loja inteira, senão margem/prazo/hoje viriam com o total da loja.
function buildTeamTotal(
  rows: VendedorResumo[],
  base: VendedorResumo | undefined,
  cod: string,
  nome: string,
  memberCodes?: string[],
): VendedorResumo {
  const sum = (key: keyof VendedorResumo) =>
    rows.reduce((acc, r) => acc + (parseFloat(String(r[key])) || 0), 0);
  const totalMETA = sum("META");
  const totalFATURADO = sum("FATURADO");
  const totalQtdVendas = sum("QTD_VENDAS");
  const totalMargemReal = sum("MARGEM_REAL");
  const prazoPonderado = rows.reduce(
    (acc, r) => acc + (parseFloat(String(r.PRAZO_MEDIO_DIAS)) || 0) * (parseFloat(String(r.FATURADO)) || 0),
    0,
  );
  return {
    ...(base || rows[0]),
    COD_VENDEDOR: cod,
    NOME_VENDEDOR: nome,
    MEMBER_CODES: memberCodes ?? rows.map(r => String(r.COD_VENDEDOR || "").trim()),
    META: totalMETA,
    FATURADO: totalFATURADO,
    EM_ABERTO: sum("EM_ABERTO"),
    TOTAL: sum("TOTAL"),
    FALTANTE: Math.max(0, totalMETA - sum("TOTAL")),
    TOTAL_VENDIDO_HOJE: sum("TOTAL_VENDIDO_HOJE"),
    QTD_VENDAS: totalQtdVendas,
    QTD_ORCAMENTOS: sum("QTD_ORCAMENTOS"),
    ORC_FECHADOS: sum("ORC_FECHADOS"),
    CUSTO: sum("CUSTO"),
    MARGEM_REAL: totalMargemReal,
    MARGEM_REAL_PERC: totalFATURADO > 0 ? (totalMargemReal / totalFATURADO) * 100 : 0,
    TICKET_MEDIO: totalQtdVendas > 0 ? totalFATURADO / totalQtdVendas : 0,
    PRAZO_MEDIO_DIAS: totalFATURADO > 0 ? prazoPonderado / totalFATURADO : 0,
  };
}

const MOTIVATIONAL_QUOTES = [
  { text: "O sucesso é a soma de pequenos esforços repetidos dia após dia.", author: "Robert Collier", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Robert%20Collier" },
  { text: "Seja a sua própria motivação. Venda soluções, entregue valor!", author: "Zig Ziglar", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Zig%20Ziglar" },
  { text: "Metas existem para ser batidas e limites existem para ser superados!", author: "Dale Carnegie", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Dale%20Carnegie" },
  { text: "Vender não é sobre o que você oferece, é sobre o impacto que você gera.", author: "Simon Sinek", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Simon%20Sinek" },
  { text: "Cada não te aproxima mais do próximo SIM. Continue firme!", author: "Og Mandino", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Og%20Mandino" },
  { text: "A determinação de hoje é o sucesso de amanhã. Vamos pra cima!", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "Foque no processo e os resultados virão naturalmente.", author: "Nick Saban", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Nick%20Saban" },
  { text: "A excelência não é um ato, mas um hábito. Venda com paixão!", author: "Aristóteles", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Aristoteles" },
  { text: "O único limite para as nossas conquistas de amanhã são as nossas dúvidas de hoje.", author: "Franklin D. Roosevelt", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Franklin%20D%20Roosevelt" },
  { text: "Grandes resultados requerem grandes ambições. Supere-se hoje!", author: "Heráclito", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Heraclito" },
  { text: "Se você não está cuidando do seu cliente, seu concorrente vai cuidar.", author: "Bob Hooey", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bob%20Hooey" },
  { text: "O melhor momento para plantar uma árvore foi há 20 anos. O segundo melhor é agora.", author: "Provérbio Chinês", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Proverbio%20Chines" },
  { text: "Não conte os dias, faça os dias contarem.", author: "Muhammad Ali", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Muhammad%20Ali" },
  { text: "A persistência é o caminho do êxito.", author: "Charles Chaplin", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Charles%20Chaplin" },
  { text: "O segredo de progredir é começar.", author: "Mark Twain", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Mark%20Twain" },
  { text: "A única maneira de fazer um excelente trabalho é amar o que você faz.", author: "Steve Jobs", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Steve%20Jobs" },
  { text: "O que não nos mata nos torna mais fortes.", author: "Friedrich Nietzsche", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Friedrich%20Nietzsche" },
  { text: "Falhe sete vezes, levante-se oito.", author: "Provérbio Japonês", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Proverbio%20Japones" },
  { text: "Faça do seu cliente o herói da sua história.", author: "Ann Handley", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Ann%20Handley" },
  { text: "A melhor publicidade é fazer um bom trabalho.", author: "Philip Kotler", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Philip%20Kotler" },
  { text: "O cliente compra a sua confiança antes de comprar o seu produto.", author: "Brian Tracy", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Brian%20Tracy" },
  { text: "Se você puder sonhar, você poderá fazer.", author: "Walt Disney", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Walt%20Disney" },
  { text: "Para ter sucesso, seu desejo de sucesso deve ser maior do que seu medo de fracassar.", author: "Bill Cosby", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bill%20Cosby" },
  { text: "Sucesso é caminhar de fracasso em fracasso sem perder o entusiasmo.", author: "Winston Churchill", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Winston%20Churchill" },
  { text: "Se você quer ir rápido, vá sozinho. Se você quer ir longe, vá acompanhado.", author: "Provérbio Africano", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Proverbio%20Africano" },
  { text: "Motivação é o que te faz começar. Hábito é o que te faz continuar.", author: "Jim Rohn", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Jim%20Rohn" },
  { text: "Não venda produtos. Venda sentimentos, status e soluções.", author: "Jordan Belfort", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Jordan%20Belfort" },
  { text: "Você erra 100% dos chutes que não dá.", author: "Wayne Gretzky", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Wayne%20Gretzky" },
  { text: "A oportunidade dança com aqueles que já estão na pista.", author: "H. Jackson Brown Jr.", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Jackson%20Brown" },
  { text: "Agir, eis a inteligência verdadeira. Serei o que quiser. Mas tenho que querer o que for.", author: "Fernando Pessoa", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Fernando%20Pessoa" },
  { text: "Nós somos o que fazemos repetidamente.", author: "Will Durant", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Will%20Durant" },
  { text: "A vida é 10% o que acontece comigo e 90% como eu reajo a isso.", author: "Charles Swindoll", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Charles%20Swindoll" },
  { text: "Acredite que você pode e você já está no meio do caminho.", author: "Theodore Roosevelt", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Theodore%20Roosevelt" },
  { text: "Definição de propósito é o ponto de partida de toda conquista.", author: "W. Clement Stone", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Clement%20Stone" },
  { text: "Concentre todos os seus pensamentos no trabalho que está realizando.", author: "Alexander Graham Bell", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Graham%20Bell" },
  { text: "Um cliente satisfeito é a melhor estratégia de negócios.", author: "Michael LeBoeuf", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Michael%20LeBoeuf" },
  { text: "As pessoas não compram o que você faz; elas compram o porquê de você fazer.", author: "Simon Sinek", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Simon%20Sinek" },
  { text: "Não encontre defeitos, encontre soluções.", author: "Henry Ford", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Henry%20Ford" },
  { text: "Quem quer fazer algo encontra um meio, quem não quer encontra uma desculpa.", author: "Provérbio Árabe", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Proverbio%20Arabe" },
  { text: "Obstáculos são aquelas coisas assustadoras que você vê quando desvia os olhos do seu objetivo.", author: "Henry Ford", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Henry%20Ford" },
  { text: "No meio da dificuldade encontra-se a oportunidade.", author: "Albert Einstein", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Albert%20Einstein" },
  { text: "A imaginação é mais importante que o conhecimento.", author: "Albert Einstein", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Albert%20Einstein" },
  { text: "A sorte favorece a mente preparada.", author: "Louis Pasteur", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Louis%20Pasteur" },
  { text: "Você não é pago por hora. Você é pago pelo valor que traz para a hora.", author: "Jim Rohn", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Jim%20Rohn" },
  { text: "O sucesso não é a chave para a felicidade. A felicidade é a chave para o sucesso.", author: "Albert Schweitzer", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Albert%20Schweitzer" },
  { text: "Lembre-se de que ninguém pode fazer você se sentir inferior sem o seu consentimento.", author: "Eleanor Roosevelt", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Eleanor%20Roosevelt" },
  { text: "O que você faz hoje pode melhorar todos os seus amanhãs.", author: "Ralph Marston", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Ralph%20Marston" },
  { text: "Vender é arte, ciência e conexão humana.", author: "Dale Carnegie", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Dale%20Carnegie" },
  { text: "O insucesso é apenas uma oportunidade para recomeçar com mais inteligência.", author: "Henry Ford", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Henry%20Ford" },
  { text: "Todo progresso acontece fora da zona de conforto.", author: "Michael John Bobak", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Michael%20Bobak" },
  { text: "Quanto mais eu treino, mais sorte eu tenho.", author: "Gary Player", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Gary%20Player" },
  { text: "Se você faz o que sempre fez, obterá o que sempre obteve.", author: "Tony Robbins", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Tony%20Robbins" },
  { text: "O sucesso é a habilidade de ir de fracasso em fracasso sem perder o entusiasmo.", author: "Winston Churchill", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Winston%20Churchill" },
  { text: "Não se preocupe em ser bem-sucedido, mas sim em ser valioso.", author: "Albert Einstein", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Albert%20Einstein" },
  { text: "Se você não valoriza seu tempo, os outros também não o farão.", author: "Kim Garst", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Kim%20Garst" },
  { text: "Comece onde você está. Use o que você tem. Faça o que puder.", author: "Arthur Ashe", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Arthur%20Ashe" },
  { text: "Foque no cliente e todo o resto virá.", author: "Larry Page", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Larry%20Page" },
  { text: "A atitude determina a sua altitude.", author: "Zig Ziglar", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Zig%20Ziglar" },
  { text: "Não tente ser uma pessoa de sucesso. Em vez disso, seja uma pessoa de valor.", author: "Albert Einstein", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Albert%20Einstein" },
  { text: "O sucesso é aprender a ir de fracasso em fracasso sem perder a vontade.", author: "Winston Churchill", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Winston%20Churchill" },
  { text: "Descubra o que você gosta de fazer e arranje alguém que pague por isso.", author: "Katherine Whitehorn", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Katherine%20Whitehorn" },
  { text: "Daqui a um ano você vai desejar ter começado hoje.", author: "Karen Lamb", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Karen%20Lamb" },
  { text: "Você nunca é velho demais para estabelecer outro objetivo ou sonhar um novo sonho.", author: "C.S. Lewis", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=CS%20Lewis" },
  { text: "Mire na lua. Mesmo se você errar, você pousará entre as estrelas.", author: "Les Brown", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Les%20Brown" },
  { text: "Nunca ceda, nunca ceda, nunca, nunca, nunca.", author: "Winston Churchill", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Winston%20Churchill" },
  { text: "Inteligência sem ambição é um pássaro sem asas.", author: "Salvador Dalí", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Salvador%20Dali" },
  { text: "O homem que move montanhas começa carregando pequenas pedras.", author: "Confúcio", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Confucio" },
  { text: "Exija muito de si mesmo e espere pouco dos outros. Assim evitará aborrecimentos.", author: "Confúcio", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Confucio" },
  { text: "O guerreiro de sucesso é o homem médio, com foco semelhante a um laser.", author: "Bruce Lee", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bruce%20Lee" },
  { text: "Não reze por uma vida fácil, reze por forças para suportar uma difícil.", author: "Bruce Lee", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bruce%20Lee" },
  { text: "A simplicidade é o último grau de sofisticação.", author: "Leonardo da Vinci", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Leonardo%20da%20Vinci" },
  { text: "Saber não é suficiente; devemos aplicar. Querer não é suficiente; devemos fazer.", author: "Johann Wolfgang von Goethe", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Goethe" },
  { text: "Vá na direção de seus sonhos. Viva a vida que você imaginou.", author: "Henry David Thoreau", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Henry%20Thoreau" },
  { text: "Faça o que você puder, com o que você tem, onde você estiver.", author: "Theodore Roosevelt", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Theodore%20Roosevelt" },
  { text: "A energia e a persistência conquistam todas as coisas.", author: "Benjamin Franklin", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Benjamin%20Franklin" },
  { text: "Se você fechar a porta para todos os erros, a verdade ficará de fora.", author: "Rabindranath Tagore", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Rabindranath%20Tagore" },
  { text: "O insucesso é uma ótima oportunidade para recomeçar com mais inteligência.", author: "Henry Ford", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Henry%20Ford" },
  { text: "Venda o problema que você resolve, não o produto que você faz.", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "Nada é impossível para aquele que persiste.", author: "Alexandre, o Grande", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Alexandre%20o%20Grande" },
  { text: "Faça da sua vida um reflexo dos seus maiores sonhos.", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "Se você não lutar pelo que quer, não lamente pelo que perdeu.", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "A disciplina é a ponte entre metas e realizações.", author: "Jim Rohn", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Jim%20Rohn" },
  { text: "A melhor maneira de prever o futuro é criá-lo.", author: "Peter Drucker", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Peter%20Drucker" },
  { text: "O que pode ser medido, pode ser melhorado.", author: "Peter Drucker", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Peter%20Drucker" },
  { text: "Não há atalhos para os lugares onde vale a pena ir.", author: "Beverly Sills", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Beverly%20Sills" },
  { text: "A coragem não é a ausência do medo, mas o triunfo sobre ele.", author: "Nelson Mandela", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Nelson%20Mandela" },
  { text: "Sempre parece impossível até que seja feito.", author: "Nelson Mandela", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Nelson%20Mandela" },
  { text: "Seus clientes mais insatisfeitos são sua maior fonte de aprendizado.", author: "Bill Gates", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bill%20Gates" },
  { text: "O sucesso é um mestre terrível. Ele convence as pessoas inteligentes de que elas não podem perder.", author: "Bill Gates", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bill%20Gates" },
  { text: "Se você nasceu pobre, não é sua culpa. Mas se você morrer pobre, a culpa é sua.", author: "Bill Gates", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bill%20Gates" },
  { text: "Faça o seu melhor hoje e o amanhã se cuidará sozinho.", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "O entusiasmo é a maior força da alma. Conserva-o.", author: "Gerard de Nerval", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Gerard%20de%20Nerval" },
  { text: "Se você não tem metas, você trabalha para quem tem.", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "O segredo do sucesso na vida é o homem estar pronto para sua oportunidade quando ela surgir.", author: "Benjamin Disraeli", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Benjamin%20Disraeli" },
  { text: "Aqueles que não podem mudar suas mentes não podem mudar nada.", author: "George Bernard Shaw", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Bernard%20Shaw" },
  { text: "O único lugar onde o sucesso vem antes do trabalho é no dicionário.", author: "Vidal Sassoon", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Vidal%20Sassoon" },
  { text: "O fracasso é a oportunidade de começar de novo, inteligentemente.", author: "Henry Ford", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Henry%20Ford" },
  { text: "Na vida, não existem prêmios ou punições, existem apenas consequências.", author: "Robert Ingersoll", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Robert%20Ingersoll" },
  { text: "A mente que se abre a uma nova ideia jamais voltarará ao seu tamanho original.", author: "Albert Einstein", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Albert%20Einstein" },
  { text: "Viva como se fosse morrer amanhã. Aprenda como se fosse viver para sempre.", author: "Mah Mahatma Gandhi", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Mahatma%20Gandhi" },
  { text: "Onde há vontade, há um caminho.", author: "Provérbio Inglês", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Proverbio%20Ingles" },
  { text: "Não se preocupe com os fracassos, preocupe-se com as chances que você perde quando nem sequer tenta.", author: "Jack Canfield", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Jack%20Canfield" },
  { text: "Nós somos o que fazemos repetidas vezes; a excelência, portanto, não é um feito, mas um hábito.", author: "Aristóteles", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Aristoteles" },
  { text: "A diferença entre o ordinário e o extraordinário é aquele pequeno extra.", author: "Jimmy Johnson", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Jimmy%20Johnson" },
  { text: "Não espere por circunstâncias ideais. Elas nunca chegarão. Comece agora.", author: "Napoleon Hill", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Napoleon%20Hill" },
  { text: "O que quer que a mente humana possa conceber e acreditar, ela pode alcançar.", author: "Napoleon Hill", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Napoleon%20Hill" },
  { text: "O homem que faz mais do que é pago para fazer, em breve será pago por mais do que faz.", author: "Napoleon Hill", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Napoleon%20Hill" },
  { text: "Desafie seus limites, não limite seus desafios.", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "Na vida de vendas, você é o comandante do seu próprio destino.", author: "Og Mandino", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Og%20Mandino" },
  { text: "O medo do fracasso é o maior assassino de sonhos do mundo.", author: "Desconhecido", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Desconhecido" },
  { text: "Nada grandioso jamais foi alcançado sem entusiasmo.", author: "Ralph Waldo Emerson", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Waldo%20Emerson" },
  { text: "Vencer a si mesmo é a maior das vitórias.", author: "Platão", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Platao" },
  { text: "No final, não são os anos em sua vida que contam. É a vida em seus anos.", author: "Abraham Lincoln", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Abraham%20Lincoln" },
  { text: "Na adversidade, alguns quebram; outros batem recordes.", author: "William A. Ward", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=William%20Ward" },
  { text: "A vitória pertence ao mais perseverante.", author: "Napoleão Bonaparte", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Napoleao" },
  { text: "A melhor maneira de começar é parar de falar e começar a fazer.", author: "Walt Disney", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Walt%20Disney" },
  { text: "O sucesso nas vendas resulta do foco nas necessidades do cliente, não no bolso dele.", author: "Zig Ziglar", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Zig%20Ziglar" },
  { text: "O fracasso é apenas uma pausa para organizar as ideias.", author: "Dale Carnegie", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Dale%20Carnegie" },
  { text: "A força não vem da capacidade física, mas de uma vontade indomável.", author: "Mahatma Gandhi", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Mahatma%20Gandhi" },
  { text: "A vitória mais bela é a que se consegue sobre si mesmo.", author: "Ayrton Senna", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Ayrton%20Senna" }
];

const formatNameTitleCase = (name: string) => {
  if (!name) return "";
  const trimmed = name.trim().split(' ')[0];
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const formatBRL = (val: number | string) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(num || 0);
};

// Funções de auxílio para cálculo de tempo (Lógica Gestão de Tempo)
const pad2 = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Domingo de Páscoa (algoritmo de Meeus/Butcher) — base p/ Sexta-feira Santa.
const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mth = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mth + 114) / 31);
  const day = ((h + l - 7 * mth + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

// Feriados que fecham a loja e NÃO contam como dia útil: nacionais oficiais +
// Sexta-feira Santa (móvel) + 09/07 (Revolução Constitucionalista, estadual SP).
// Carnaval e Corpus Christi são pontos facultativos — adicione aqui se a loja fechar.
const feriadosCache: Record<number, Set<string>> = {};
const getFeriados = (year: number): Set<string> => {
  if (feriadosCache[year]) return feriadosCache[year];
  const set = new Set<string>([
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-07-09`, // Revolução Constitucionalista (SP)
    `${year}-09-07`, // Independência
    `${year}-10-12`, // N. Sra. Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra
    `${year}-12-25`, // Natal
  ]);
  const goodFriday = getEasterSunday(year);
  goodFriday.setDate(goodFriday.getDate() - 2); // Sexta-feira Santa
  set.add(toISODate(goodFriday));
  feriadosCache[year] = set;
  return set;
};

const isDiaUtil = (d: Date, feriados: Set<string>) => {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6 && !feriados.has(toISODate(d));
};

// Todos os cálculos de ritmo (equilíbrio, diário, % vs equilíbrio) são relativos a
// uma data de referência — que é hoje no painel, mas vira o mês escolhido quando o
// modal "Todos os Vendedores" está filtrado. Sem receber esse `ref`, um mês passado
// sairia com o equilíbrio e o diário do mês corrente.
const getDiasUteisNoMes = (ref: Date = new Date()) => {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const feriados = getFeriados(y);
  const lastDay = new Date(y, m + 1, 0).getDate();
  let count = 0;
  for (let i = 1; i <= lastDay; i++) {
    if (isDiaUtil(new Date(y, m, i), feriados)) count++;
  }
  return count;
};

// Dias úteis de `ref` (inclusive) até o fim do mês de `ref`. Para um mês já
// encerrado o resultado é 0 — não há mais o que vender nele.
const getDiasUteisRestantes = (ref: Date = new Date()) => {
  const y = ref.getFullYear();
  const feriados = getFeriados(y);
  const end = new Date(y, ref.getMonth() + 1, 0);
  const hoje = new Date();
  const mesEncerrado =
    y < hoje.getFullYear() || (y === hoje.getFullYear() && ref.getMonth() < hoje.getMonth());
  if (mesEncerrado) return 0;
  // Começa a partir do dia seguinte — o dia atual já conta como trabalhado
  const start = new Date(y, ref.getMonth(), ref.getDate() + 1);
  let count = 0;
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    if (isDiaUtil(dt, feriados)) count++;
  }
  return count;
};

// Quanto o vendedor deveria ter vendido até a data de referência para estar no
// ritmo da meta. Em mês encerrado o equilíbrio é a meta cheia.
const calcEquilibrio = (row?: VendedorResumo | null, ref?: Date) => {
  if (!row) return 0;
  const totalWorkingDays = getDiasUteisNoMes(ref);
  const remainingDays = getDiasUteisRestantes(ref);
  const daysPassed = row.dias_trabalhados ?? Math.max(0, totalWorkingDays - remainingDays);
  const metaNum = typeof row.META === 'string' ? parseFloat(row.META) : row.META;
  return (Number(metaNum) / totalWorkingDays) * daysPassed;
};

const calcDiarioNecessario = (row?: VendedorResumo | null, ref?: Date) => {
  if (!row) return 0;
  const restantes = getDiasUteisRestantes(ref);
  // Mês encerrado: não existe "quanto preciso vender por dia" — nada a recuperar.
  if (restantes <= 0) return 0;
  const faltante = typeof row.FALTANTE === 'string' ? parseFloat(row.FALTANTE) : (row.FALTANTE || 0);
  return Math.max(0, Number(faltante) / restantes);
};

const calcDiariaPraticada = (row?: VendedorResumo | null, ref?: Date) => {
  if (!row) return 0;
  const totalWorkingDays = getDiasUteisNoMes(ref);
  const remainingDays = getDiasUteisRestantes(ref);
  const daysPassed = row.dias_trabalhados ?? Math.max(1, totalWorkingDays - remainingDays);
  if (daysPassed <= 0) return 0;
  return Number(row.TOTAL || 0) / daysPassed;
};

const calcProjecao = (row?: VendedorResumo | null, ref?: Date) => {
  if (!row) return 0;
  const totalWorkingDays = getDiasUteisNoMes(ref);
  const diaria = calcDiariaPraticada(row, ref);
  return diaria * totalWorkingDays;
};

// % do ritmo: quanto já vendeu em relação ao equilíbrio da data de referência.
const calcPercentVsEquilibrio = (row?: VendedorResumo | null, ref?: Date) => {
  const equilibrio = calcEquilibrio(row, ref);
  const total = Number(row?.TOTAL || 0);
  return equilibrio > 0 ? (total / equilibrio) * 100 : 0;
};

// Tx de conversão de uma linha: vendido / (vendido + perdido).
// Linhas agregadas (time do supervisor, ou subtotal "TEAM:") não têm código no
// perdidoMap — nesses casos soma o perdido dos membros, em vez de cair no
// default de perdido 0 (que renderizaria 100% de conversão).
// Usa FATURADO, não TOTAL: o TOTAL soma o "em aberto", que é pedido ainda não
// faturado — promessa, não conversão decidida. Era a maior causa de o painel
// mostrar uma taxa muito acima da tela de Orçamentos para o mesmo vendedor.
const calcTaxaConversao = (row: VendedorResumo, perdidoMap: Map<string, number>, teamCodes?: string[]) => {
  const faturado = typeof row.FATURADO === 'string' ? parseFloat(row.FATURADO) : (row.FATURADO || 0);
  const codesToSum = (teamCodes && teamCodes.length > 0 && row.COD_VENDEDOR === "MEDIA")
    ? teamCodes
    : (row.COD_VENDEDOR.startsWith("TEAM:") ? row.MEMBER_CODES : undefined);
  const perdido = codesToSum
    ? codesToSum.reduce((acc, c) => acc + (perdidoMap.get(String(c).trim()) || 0), 0)
    : perdidoMap.get(String(row.COD_VENDEDOR || "").trim()) || 0;
  return taxaConversaoValor(Number(faturado) || 0, perdido);
};

// Versão compacta do SalesMetricsCard, usada no modal "Todos os Vendedores".
// Repete o mesmo visual do card principal (rosca de ritmo + vendido hoje +
// barra de meta + indicadores), com os mesmos cálculos.
function VendedorMiniCard({ row, perdidoMap, refDate, isActive, onSelect }: {
  row: VendedorResumo;
  perdidoMap: Map<string, number> | null;
  refDate?: Date;
  isActive?: boolean;
  onSelect?: () => void;
}) {
  const equilibrio = calcEquilibrio(row, refDate);
  const total = Number(row.TOTAL || 0);
  const percent = calcPercentVsEquilibrio(row, refDate);
  const metaNum = Number(row.META || 0);
  const atingimento = metaNum > 0 ? (total / metaNum) * 100 : 0;
  const diffMeta = metaNum - total;
  const isTeam = row.COD_VENDEDOR.startsWith("TEAM:");
  const isTotal = row.COD_VENDEDOR === "MEDIA";
  const hoje = new Date();
  const isMesCorrente =
    !refDate ||
    (refDate.getFullYear() === hoje.getFullYear() && refDate.getMonth() === hoje.getMonth());

  const nome = isTotal
    ? "Total Geral"
    : (row.NOME_VENDEDOR || "").trim().split(/\s+/).slice(0, 2).join(" ");

  const miniMetrics = [
    { label: "Meta", value: formatBRL(row.META), icon: Target, valueColor: "text-foreground", tooltip: "Meta de faturamento do mês" },
    { label: "Faltante", value: formatBRL(row.FALTANTE), icon: ArrowDownRight, valueColor: Number(row.FALTANTE) <= 0 ? "text-emerald-600" : "text-rose-600", tooltip: "Meta − Total (faturado + em aberto)" },
    { label: "Faturado", value: formatBRL(row.FATURADO), icon: Clock, valueColor: "text-emerald-600", tooltip: "Notas fiscais emitidas no mês" },
    { label: "Em Aberto", value: formatBRL(row.EM_ABERTO), icon: Clock, valueColor: "text-amber-600", tooltip: "Pedidos em aberto (ainda não faturados)" },
    { label: "Total", value: formatBRL(row.TOTAL), icon: TrendingUp, valueColor: "text-foreground", tooltip: "Faturado + Em Aberto" },
    { label: "Equilíbrio", value: formatBRL(equilibrio), icon: BarChart3, valueColor: "text-blue-600", tooltip: "Meta ÷ Dias úteis × Dias trabalhados" },
    { label: "Diário", value: formatBRL(calcDiarioNecessario(row, refDate)), icon: Zap, valueColor: "text-foreground", tooltip: "Faltante ÷ Dias úteis restantes" },
    { label: "Diária Realizada", value: formatBRL(calcDiariaPraticada(row, refDate)), icon: Zap, valueColor: "text-cyan-600", tooltip: "Total ÷ Dias úteis trabalhados" },
    { label: "Projeção", value: formatBRL(calcProjecao(row, refDate)), icon: TrendingUp, valueColor: calcProjecao(row, refDate) >= Number(row.META || 0) ? "text-emerald-600" : "text-rose-600", tooltip: "Diária realizada × Total dias úteis do mês" },
    { label: "Tx Conversão", value: perdidoMap ? `${calcTaxaConversao(row, perdidoMap).toFixed(1)}%` : "—", icon: PieChart, valueColor: "text-blue-600", tooltip: "Vendas ÷ (Vendas + Perdidos)" },
    { label: "Ticket Médio", value: formatBRL(row.TICKET_MEDIO), icon: DollarSign, valueColor: "text-foreground", tooltip: "Faturado ÷ Quantidade de vendas" },
    { label: "Margem", value: `${Number(row.MARGEM_REAL_PERC || row.MARGEM_PCT || 0).toFixed(1)}%`, icon: TrendingUp, valueColor: "text-blue-600", tooltip: "Margem real sobre o faturado" },
  ];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left bg-card border rounded-xl p-4 flex flex-col transition-all hover:border-blue-500/50 hover:shadow-md",
        isActive ? "border-blue-500 ring-1 ring-blue-500/30" : "border-border"
      )}
    >
      {/* Nome */}
      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-border/40">
        <span className={cn(
          "text-[10px] font-black uppercase tracking-tight truncate",
          isTotal || isTeam ? "text-blue-600 dark:text-blue-400" : "text-foreground"
        )}>
          {nome}
        </span>
        {isTeam && (
          <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Time</span>
        )}
      </div>

      {/* Rosca de meta */}
      <div className="mb-2 flex flex-col items-center">
        <div className="relative w-20 h-20">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="9" fill="transparent" className="text-secondary dark:text-slate-800" />
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="currentColor"
              strokeWidth="9"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - Math.min(atingimento, 100) / 100)}
              strokeLinecap="round"
              fill="transparent"
              className={cn(
                "transition-all duration-1000 ease-out",
                atingimento >= 100 ? "text-blue-600 dark:text-blue-500" : "text-rose-500"
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none text-center">
            <span className={cn("text-base font-black tracking-tighter", atingimento >= 100 ? "text-foreground" : "text-rose-600")}>
              {atingimento.toFixed(0)}%
            </span>
          </div>
        </div>
        <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5">
          {metaNum <= 0 ? "Sem Meta" : (diffMeta > 0 ? `- ${formatBRL(diffMeta)}` : `+ ${formatBRL(Math.abs(diffMeta))}`)}
        </span>
      </div>

      {/* Vendido no dia de referência (hoje, ou o último dia do mês filtrado) */}
      <div className="mb-2 flex flex-col items-center text-center">
        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
          {isMesCorrente
            ? "Vendido Hoje"
            : `Vendido ${refDate!.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
        </p>
        <h3 className="text-base font-black text-foreground tracking-tighter">{formatBRL(row.TOTAL_VENDIDO_HOJE || 0)}</h3>
      </div>

      {/* Barra de equilíbrio */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[9px] font-bold mb-1">
          <span className="text-blue-600 dark:text-blue-500">Equilíbrio</span>
          <span className="text-foreground">{percent.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full bg-secondary dark:bg-slate-800 rounded-full overflow-hidden border border-border">
          <div
            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-auto">
        {miniMetrics.map((mm, i) => (
          <div key={i} className="flex items-start gap-1.5 min-w-0">
            <mm.icon className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex flex-col min-w-0">
              <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider truncate flex items-center gap-1">
                {mm.label}
                {mm.tooltip && (
                  <span title={mm.tooltip} className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-muted-foreground/15 text-muted-foreground text-[7px] font-black cursor-help shrink-0">!</span>
                )}
              </span>
              <span className={cn("text-[10px] font-black tracking-tight truncate", mm.valueColor)}>{mm.value}</span>
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

export function SalesMetricsCard({ isCompact, userProfile, data: externalData, storeData, loading: externalLoading, perdidoMap: perdidoMapProp = new Map() }: { isCompact?: boolean, userProfile?: UserProfileLite, data?: VendedorResumo, storeData?: VendedorResumo, loading?: boolean, perdidoMap?: Map<string, number> }) {
  // Diretor tem visão própria (Total geral); não deve semear o painel com a linha
  // individual vinda do App — senão pisca a linha do diretor antes do efeito ajustar.
  const isDirectorInit = (userProfile?.role?.toUpperCase() || "").includes("DIRETOR");
  const [internalLoading, setInternalLoading] = useState(isDirectorInit ? true : !externalData);
  const [data, setData] = useState<VendedorResumo | null>(isDirectorInit ? null : (externalData || null));
  const [allVendedores, setAllVendedores] = useState<VendedorResumo[]>([]);
  // Data de referência do painel (mês/dia). Default hoje; ajustável no modal.
  const [refDate, setRefDate] = useState<Date>(() => new Date());
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear());
  // Perdido do mês filtrado. O `perdidoMap` que vem do App é sempre do mês corrente;
  // ao escolher outro mês precisamos do perdido daquele período, senão a Tx Conversão
  // divide o TOTAL do mês filtrado pelo perdido do mês atual.
  const [perdidoMapMes, setPerdidoMapMes] = useState<Map<string, number> | null>(null);
  const isMesCorrente = (() => {
    const h = new Date();
    return refDate.getFullYear() === h.getFullYear() && refDate.getMonth() === h.getMonth();
  })();
  // `null` = perdido do mês filtrado ainda carregando → a Tx Conversão sai como "—"
  // em vez de 100% (que é o que um mapa vazio produziria).
  const perdidoMap: Map<string, number> | null = isMesCorrente ? perdidoMapProp : perdidoMapMes;
  const [selectedCod, setSelectedCod] = useState<string>("TOTAL");
  // Códigos dos vendedores do time (quando supervisor) — usado para agregar o "perdido"
  // do time na Tx Conversão em vez de pegar o total da loja (chave "MEDIA").
  const [teamCodes, setTeamCodes] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isAllOpen, setIsAllOpen] = useState(false);
  const [vendasDiarias, setVendasDiarias] = useState<VendaDiaria[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsTab, setStatsTab] = useState<'vendido' | 'faturado'>('vendido');
  const [periodTab, setPeriodTab] = useState<'mes' | '7dias'>('7dias');
  const [showSocial, setShowSocial] = useState(() => {
    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      return localStorage.getItem(`carflax-stories-dismissed-${todayStr}`) !== "true";
    } catch {
      return true;
    }
  });
  const [activeQuote, setActiveQuote] = useState<{ text: string; author: string; avatar?: string }>(() => 
    MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]
  );
  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  });

  const cardRef = useRef<HTMLDivElement>(null);
  const [isSendingPhoto, setIsSendingPhoto] = useState(false);

  const sendPanelPhoto = async () => {
    const phone = userProfile?.whatsapp || userProfile?.phone;
    if (!phone) {
      alert("Aviso: Cadastre o seu número de WhatsApp no seu Perfil antes de enviar a foto.");
      return;
    }

    setIsSendingPhoto(true);
    let tempContainer: HTMLDivElement | null = null;
    try {
      const greeting = getGreeting();
      const rawName = userProfile?.name 
        ? userProfile.name 
        : (data?.NOME_VENDEDOR && selectedCod !== "MEDIA" && selectedCod !== "TOTAL" 
          ? data.NOME_VENDEDOR 
          : 'Time');
      const name = formatNameTitleCase(rawName);
      
      const avatarUrl = userProfile?.avatar || data?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || data?.NOME_VENDEDOR || "vendedor"}`;
      const quoteText = activeQuote?.text || "";
      const quoteAuthor = activeQuote?.author || "";

      // Criar o container temporário fora da tela (Story vertical 9:16 - 1080x1920)
      tempContainer = document.createElement("div");
      tempContainer.style.position = "fixed";
      tempContainer.style.left = "-9999px";
      tempContainer.style.top = "-9999px";
      tempContainer.style.width = "1080px";
      tempContainer.style.height = "1920px";
      tempContainer.style.display = "flex";
      tempContainer.style.flexDirection = "column";
      tempContainer.style.alignItems = "center";
      tempContainer.style.justifyContent = "space-between";
      tempContainer.style.padding = "140px 80px 120px 80px";
      tempContainer.style.backgroundColor = "#030712";
      tempContainer.style.background = "linear-gradient(to bottom, #030712 0%, #071124 50%, #030712 100%)";
      tempContainer.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      tempContainer.style.color = "#ffffff";
      tempContainer.style.boxSizing = "border-box";
      tempContainer.style.zIndex = "-1000";

      tempContainer.innerHTML = `
        <!-- Top header -->
        <div style="display: flex; align-items: center; gap: 12px; opacity: 0.5;">
          <span style="font-size: 26px; font-weight: 900; letter-spacing: 0.35em; text-transform: uppercase;">CARFLAX HUB</span>
        </div>

        <!-- Greeting -->
        <div style="text-align: center; margin-top: 40px; margin-bottom: 20px; background: transparent !important; border: none; outline: none; box-shadow: none;">
          <div style="font-size: 72px; font-weight: 900; margin: 0; letter-spacing: -0.02em; color: #ffffff; text-transform: none !important; background: transparent !important; background-color: transparent !important; border: none !important; outline: none !important; box-shadow: none !important; -webkit-background-clip: unset !important; -webkit-text-fill-color: currentColor !important;">
            ${greeting}, ${name}!
          </div>
        </div>

        <!-- Avatar Container -->
        <div style="position: relative; display: flex; justify-content: center; margin: 50px 0;">
          <div style="width: 380px; height: 380px; border-radius: 50%; border: 6px solid #3b82f6; padding: 10px; background: #030712; box-shadow: 0 0 60px rgba(59, 130, 246, 0.4); display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <img src="${avatarUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" crossorigin="anonymous" />
          </div>
        </div>

        <!-- Quote -->
        <div style="max-width: 860px; width: 100%; text-align: center; position: relative; padding: 60px 40px; margin: 40px 0; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 36px; backdrop-filter: blur(25px);">
          <span style="font-size: 150px; line-height: 0; font-family: serif; color: #3b82f6; opacity: 0.15; position: absolute; left: 30px; top: 80px; user-select: none;">“</span>
          <p style="font-size: 40px; font-weight: 700; font-style: italic; line-height: 1.6; margin: 0 0 30px 0; color: #f3f4f6; padding: 0 30px;">
            ${quoteText}
          </p>
          <span style="font-size: 30px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; color: #9ca3af; opacity: 0.8;">
            — ${quoteAuthor}
          </span>
        </div>

        <!-- Clock & Footer -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 50px; width: 100%; margin-top: auto;">
          <!-- Time -->
          <div style="font-size: 180px; font-weight: 700; letter-spacing: -0.05em; color: #ffffff; text-shadow: 0 0 40px rgba(255, 255, 255, 0.15);">
            ${currentTime}
          </div>

          <!-- Bora pra Cima Button -->
          <div style="padding: 24px 64px; border-radius: 100px; border: 2px solid rgba(255,255,255,0.15); background: rgba(59, 130, 246, 0.1); font-size: 28px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; display: flex; align-items: center; gap: 15px; color: #ffffff; box-shadow: 0 10px 40px rgba(59, 130, 246, 0.15);">
            <span>Bora pra cima</span>
            <span style="color: #3b82f6; font-size: 32px;">⚡</span>
          </div>
        </div>
      `;

      document.body.appendChild(tempContainer);

      const img = tempContainer.querySelector("img");
      if (img && !img.complete) {
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }

      // Capturar o container como canvas
      const canvas = await html2canvas(tempContainer, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 2, // Garante alta definição
        logging: false,
        width: 1080,
        height: 1920
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });

      if (!blob) throw new Error("Falha ao gerar imagem do painel.");

      const file = new File([blob], `story-boa-tarde-${Date.now()}.png`, { type: "image/png" });

      // Envia com skipCompression: true para qualidade máxima
      const imageUrl = await uploadImage(file, "whatsapp-media", true);
      if (!imageUrl) throw new Error("Erro ao fazer upload da imagem no Supabase Storage.");

      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length >= 10 && !cleanPhone.startsWith("55")) {
        cleanPhone = "55" + cleanPhone;
      }
      const remoteJid = `${cleanPhone}@s.whatsapp.net`;

      const { evolutionApi } = await import("@/lib/evolution-v2");
      await evolutionApi.sendImage(remoteJid, imageUrl, `Boa tarde! Painel enviado por ${userProfile?.name || 'Vendedor'}. 🚀`);

      alert("Painel de Boa tarde (Story) enviado com sucesso para o seu WhatsApp!");
    } catch (err: unknown) {
      console.error("[SendPanelPhoto] Erro:", err);
      const error = err as Error;
      alert(`Falha ao enviar painel: ${error.message || String(error)}`);
    } finally {
      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setIsSendingPhoto(false);
    }
  };

  const dismissSocialToday = () => {
    setShowSocial(false);
    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      localStorage.setItem(`carflax-stories-dismissed-${todayStr}`, "true");
    } catch (e) {
      console.warn("localStorage error:", e);
    }
  };

  const getRandomQuote = useCallback((current: { text: string; author: string; avatar?: string } | null) => {
    const filtered = MOTIVATIONAL_QUOTES.filter(q => q.text !== current?.text);
    return filtered[Math.floor(Math.random() * filtered.length)];
  }, []);

  const openStats = useCallback(async () => {
    setIsStatsOpen(true);
    setStatsLoading(true);
    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const dataStr = `${yyyy}-${mm}-${dd}`;
      const cod = selectedCod === "MEDIA" || selectedCod === "TOTAL" || selectedCod.startsWith("TEAM:") ? undefined : selectedCod;
      const result = await apiVendasDiarias(cod, dataStr);
      setVendasDiarias(result);
    } catch (err) {
      console.error("Erro ao carregar vendas diárias:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [selectedCod]);

  const loading = externalLoading !== undefined ? externalLoading : internalLoading;
  const filteredData = periodTab === '7dias' ? vendasDiarias.slice(-7) : vendasDiarias;

  useEffect(() => {
    let cancelled = false;

    const role = userProfile?.role?.toUpperCase() || "";
    const dept = userProfile?.department?.toUpperCase() || "";
    const isComercialDept = dept === "COMERCIAL" || dept === "VENDAS";
    // Visão GERAL (loja inteira) só para Gerente de Vendas, Admin e Diretoria.
    const isDirector = role.includes("DIRETOR"); // DIRETOR e DIRETORA → geral + times
    const isGerenteVendas =
      role.includes("GERENTE") && (isComercialDept || role.includes("VENDA") || role.includes("COMERCIAL"));
    const isManager = role === "ADMIN" || isGerenteVendas;
    const isSupervisor = !isManager && !isDirector && (role.includes("SUPERVISOR") || userProfile?.is_leader === true);

    // O diretor tem visão própria (Total geral + times + vendedores no seletor).
    // O App envia como `externalData` a linha individual do próprio diretor —
    // se aplicássemos isso, o painel abriria no Total e, ao chegar o externalData,
    // pularia para a linha do diretor. Por isso, ignoramos o externalData p/ diretor.
    const extData = isDirector ? undefined : externalData;

    if (extData) {
      setData(extData);
      setInternalLoading(false);
    }

    if (extData && !isManager && !isSupervisor && !isDirector) return;

    async function fetchData() {
      try {
        if (!extData) setInternalLoading(true);
        const now = refDate;
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const dataStr = `${yyyy}-${mm}-${dd}`;

        const codVendedor = userProfile?.operator_code || userProfile?.operatorCode || "049";

        if (isDirector) {
          // Diretor(a): vê o Total Geral (empresa), os subtotais por time de cada
          // supervisor e todos os vendedores individualmente.
          const [response, orgRes, metasMesDir] = await Promise.all([
            apiDashboardGeral(undefined, dataStr),
            supabase.from("usuarios").select("id, operator_code, name, role, responsavel_id, is_leader"),
            apiDashboardMetas(dataStr).catch(() => [] as { COD_VENDEDOR: string; META: number | string }[]),
          ]);
          const usuarios = (orgRes.data || []) as OrgUser[];
          const metaMapDir = new Map<string, number>(
            (metasMesDir || []).map((mt) => [String(mt.COD_VENDEDOR).trim(), parseFloat(String(mt.META)) || 0]),
          );

          if (response && response.length > 0) {
            const mediaRow = response.find(r => r.COD_VENDEDOR === "MEDIA");
            const individuais = response.filter(r => r.COD_VENDEDOR !== "MEDIA");
            const erpByCod = new Map(individuais.map(r => [String(r.COD_VENDEDOR).trim(), r]));

            // Agrupa subordinados por responsável (supervisor)
            const membrosPorResponsavel = new Map<string, OrgUser[]>();
            for (const u of usuarios) {
              if (!u.responsavel_id) continue;
              if (!membrosPorResponsavel.has(u.responsavel_id)) membrosPorResponsavel.set(u.responsavel_id, []);
              membrosPorResponsavel.get(u.responsavel_id)!.push(u);
            }

            // Cada supervisor = usuário que é responsável por ≥1 pessoa.
            const teamTotals: VendedorResumo[] = [];
            // Os mesmos vendedores sem linha no ERP também precisam aparecer na
            // lista individual — senão a diretoria não consegue abrir o card de
            // quem ainda não vendeu no mês.
            const semLinhaGlobal: VendedorResumo[] = [];
            for (const sup of usuarios) {
              const membros = membrosPorResponsavel.get(sup.id);
              if (!membros || membros.length === 0) continue;
              const cods = new Set<string>();
              if (sup.operator_code) cods.add(String(sup.operator_code).trim());
              membros.forEach(m => { if (m.operator_code) cods.add(String(m.operator_code).trim()); });
              // Vendedor sem faturamento no mês não tem linha no ERP. Descartá-lo
              // apagava a meta dele do total do time: o card do Canal Mesa aparecia
              // com 765.217 para a diretoria e 968.233 para o supervisor, porque
              // dois membros ainda não tinham vendido. Entra com a meta real (CADMET)
              // e o resto zerado — mesmo tratamento que o caminho do supervisor já
              // fazia mais abaixo.
              const rowsErp = [...cods].map((c) => erpByCod.get(c)).filter(Boolean) as VendedorResumo[];
              const semLinha: VendedorResumo[] = [...cods]
                .filter((c) => !erpByCod.has(c))
                .map((c) => ({ cod: c, meta: metaMapDir.get(c) || 0 }))
                .filter(({ meta }) => meta > 0)
                .map(({ cod, meta }) => {
                  const membro = [sup, ...membros].find(
                    (u) => String(u.operator_code || "").trim() === cod,
                  );
                  return {
                    COD_VENDEDOR: cod,
                    NOME_VENDEDOR: membro?.name || cod,
                    META: meta, FATURADO: 0, EM_ABERTO: 0, TOTAL: 0, FALTANTE: meta,
                    CUSTO: 0, MARGEM_REAL: 0, MARGEM_REAL_PERC: 0,
                    QTD_VENDAS: 0, TICKET_MEDIO: 0, QTD_ORCAMENTOS: 0, ORC_FECHADOS: 0,
                    PRAZO_MEDIO_DIAS: 0, TOTAL_VENDIDO_HOJE: 0,
                  } as VendedorResumo;
                });
              const rows = [...rowsErp, ...semLinha];
              if (rows.length === 0) continue;
              semLinhaGlobal.push(...semLinha);
              teamTotals.push(buildTeamTotal(rows, mediaRow, `TEAM:${sup.id}`, formatTeamName(sup.name), [...cods]));
            }
            teamTotals.sort(
              (a, b) => (parseFloat(String(b.FATURADO)) || 0) - (parseFloat(String(a.FATURADO)) || 0),
            );

            if (cancelled) return;
            setAllVendedores([
              ...(mediaRow ? [mediaRow] : []),
              ...teamTotals,
              ...individuais,
              ...semLinhaGlobal.filter(
                (p, i, arr) => arr.findIndex((o) => o.COD_VENDEDOR === p.COD_VENDEDOR) === i,
              ),
            ]);
            if (!extData) {
              if (mediaRow) {
                setData(mediaRow);
                setSelectedCod("MEDIA");
              } else {
                setData(response[0]);
                setSelectedCod(response[0].COD_VENDEDOR);
              }
            }
          }
          return;
        }

        if (isSupervisor && userProfile?.id) {
          // Busca os vendedores sob responsabilidade deste supervisor
          const { data: subordinados } = await supabase
            .from("usuarios")
            .select("operator_code, name")
            .eq("responsavel_id", userProfile.id)
            .not("operator_code", "is", null);

          // Membros do time = subordinados + o próprio supervisor (ele também vende
          // e tem meta, então deve aparecer no seletor e compor o total "Meu Time").
          const teamMembers: { operator_code: string; name: string }[] = [
            ...(subordinados || []).map((u: { operator_code: string; name: string }) => ({
              operator_code: u.operator_code,
              name: u.name,
            })),
          ];
          if (codVendedor && !teamMembers.some(m => m.operator_code === codVendedor)) {
            teamMembers.push({ operator_code: codVendedor, name: userProfile?.name || "" });
          }

          const codsSubordinados = teamMembers.map(m => m.operator_code).filter(Boolean);
          setTeamCodes(codsSubordinados);

          // Busca dados do dashboard + metas do mês (estas incluem quem ainda não faturou)
          const [response, metasMes] = await Promise.all([
            apiDashboardGeral(undefined, dataStr),
            apiDashboardMetas(dataStr).catch(() => [] as { COD_VENDEDOR: string; META: number | string }[]),
          ]);
          const metaMap = new Map<string, number>(
            (metasMes || []).map(mt => [String(mt.COD_VENDEDOR).trim(), parseFloat(String(mt.META)) || 0]),
          );

          if (response && response.length > 0) {
            const subSetErp = response.filter(r => codsSubordinados.includes(r.COD_VENDEDOR));

            // Membros atribuídos que ainda não têm linha no ERP (ex.: vendedor
            // recém-admitido, sem faturamento no mês) entram com a META real (via
            // CADMET) e o restante zerado, para ficarem selecionáveis e já mostrarem
            // meta/faltante mesmo antes de faturar. Equilíbrio, diário e dias restantes
            // são calculados pelo próprio card a partir desses dois campos.
            const erpCods = new Set(subSetErp.map(r => r.COD_VENDEDOR));
            const placeholders: VendedorResumo[] = teamMembers
              .filter(m => m.operator_code && !erpCods.has(m.operator_code))
              .map(m => {
                const metaVal = metaMap.get(String(m.operator_code).trim()) || 0;
                return {
                  COD_VENDEDOR: m.operator_code,
                  NOME_VENDEDOR: m.name,
                  META: metaVal, FATURADO: 0, EM_ABERTO: 0, TOTAL: 0, FALTANTE: metaVal,
                  CUSTO: 0, MARGEM_REAL: 0, MARGEM_REAL_PERC: 0,
                  QTD_VENDAS: 0, TICKET_MEDIO: 0, QTD_ORCAMENTOS: 0, ORC_FECHADOS: 0,
                  PRAZO_MEDIO_DIAS: 0, TOTAL_VENDIDO_HOJE: 0,
                };
              });

            const subSet = [...subSetErp, ...placeholders];

            const mediaRow = response.find(r => r.COD_VENDEDOR === "MEDIA");
            if (subSetErp.length === 0) {
              // sem subordinados com dados no ERP — mostra os próprios dados
              const myData = response.find(r => r.COD_VENDEDOR === codVendedor) || response[0];
              if (cancelled) return;
              setAllVendedores([myData]);
              setData(myData);
              setSelectedCod(myData.COD_VENDEDOR);
            } else {
              // Re-agrega manualmente somando SÓ os vendedores do supervisor.
              // Precisa recalcular todos os campos exibidos — se herdar de mediaRow
              // (linha da loja inteira), estatísticas como "Vendido Hoje", "Margem"
              // e "Prazo" apareceriam com o total da loja, não o do time.
              const sum = (key: keyof VendedorResumo) =>
                subSet.reduce((acc, r) => acc + (parseFloat(String(r[key])) || 0), 0);

              const totalMETA = sum("META");
              const totalFATURADO = sum("FATURADO");
              const totalEM_ABERTO = sum("EM_ABERTO");
              const totalTOTAL = sum("TOTAL");
              const totalVendidoHoje = sum("TOTAL_VENDIDO_HOJE");
              const totalQtdVendas = sum("QTD_VENDAS");
              const totalQtdOrc = sum("QTD_ORCAMENTOS");
              const totalOrcFechados = sum("ORC_FECHADOS");
              const totalMargemReal = sum("MARGEM_REAL");
              const totalCusto = sum("CUSTO");
              const totalFALTANTE = Math.max(0, totalMETA - totalTOTAL);
              // Prazo médio ponderado pelo faturado de cada vendedor
              const prazoPonderado = subSet.reduce(
                (acc, r) => acc + (parseFloat(String(r.PRAZO_MEDIO_DIAS)) || 0) * (parseFloat(String(r.FATURADO)) || 0),
                0,
              );

              const teamTotal: VendedorResumo = {
                ...(mediaRow || subSet[0]),
                COD_VENDEDOR: "MEDIA",
                NOME_VENDEDOR: userProfile?.name ? formatTeamName(userProfile.name) : "Meu Time",
                META: totalMETA,
                FATURADO: totalFATURADO,
                EM_ABERTO: totalEM_ABERTO,
                TOTAL: totalTOTAL,
                FALTANTE: totalFALTANTE,
                TOTAL_VENDIDO_HOJE: totalVendidoHoje,
                QTD_VENDAS: totalQtdVendas,
                QTD_ORCAMENTOS: totalQtdOrc,
                ORC_FECHADOS: totalOrcFechados,
                CUSTO: totalCusto,
                MARGEM_REAL: totalMargemReal,
                MARGEM_REAL_PERC: totalFATURADO > 0 ? (totalMargemReal / totalFATURADO) * 100 : 0,
                TICKET_MEDIO: totalQtdVendas > 0 ? totalFATURADO / totalQtdVendas : 0,
                PRAZO_MEDIO_DIAS: totalFATURADO > 0 ? prazoPonderado / totalFATURADO : 0,
              };
              // Inclui o "Meu Time" (linha MEDIA) + os vendedores individuais no seletor
              if (cancelled) return;
              setAllVendedores([teamTotal, ...subSet]);
              setData(teamTotal);
              setSelectedCod("MEDIA");
            }
          }
          return;
        }

        const response = await apiDashboardGeral(isManager ? undefined : codVendedor, dataStr);

        if (isManager) {
          if (response && response.length > 0) {
            if (cancelled) return;
            setAllVendedores(response);

            if (!extData) {
              const mediaRow = response.find(r => r.COD_VENDEDOR === "MEDIA");
              if (mediaRow) {
                setData(mediaRow);
                setSelectedCod("MEDIA");
              } else {
                setData(response[0]);
                setSelectedCod(response[0].COD_VENDEDOR);
              }
            }
          }
        } else {
          // Vendedor comum: usa a própria linha do ERP. Se ainda não faturou no mês
          // (ex.: recém-admitido), o ERP não devolve linha — então monta com a META
          // real (CADMET) e zera o restante, para o painel não aparecer todo zerado.
          const myData = (response || []).find(r => r.COD_VENDEDOR === codVendedor);
          if (myData) {
            if (cancelled) return;
            setData(myData);
            setSelectedCod(myData.COD_VENDEDOR);
          } else {
            const metasMes = await apiDashboardMetas(dataStr).catch(
              () => [] as { COD_VENDEDOR: string; META: number | string }[],
            );
            const metaFound = (metasMes || []).find(
              mt => String(mt.COD_VENDEDOR).trim() === String(codVendedor).trim(),
            );
            const metaVal = metaFound ? parseFloat(String(metaFound.META)) || 0 : 0;
            const selfPlaceholder: VendedorResumo = {
              COD_VENDEDOR: codVendedor,
              NOME_VENDEDOR: userProfile?.name || "",
              META: metaVal, FATURADO: 0, EM_ABERTO: 0, TOTAL: 0, FALTANTE: metaVal,
              CUSTO: 0, MARGEM_REAL: 0, MARGEM_REAL_PERC: 0,
              QTD_VENDAS: 0, TICKET_MEDIO: 0, QTD_ORCAMENTOS: 0, ORC_FECHADOS: 0,
              PRAZO_MEDIO_DIAS: 0, TOTAL_VENDIDO_HOJE: 0,
            };
            if (cancelled) return;
            setData(selfPlaceholder);
            setSelectedCod(codVendedor);
          }
        }

      } catch (error) {
        console.error("Erro ao carregar métricas:", error);
      } finally {
        if (!cancelled) setInternalLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
    // Depende só dos campos primitivos usados do userProfile (não do objeto inteiro),
    // para o efeito não re-executar — piscando o painel — a cada nova referência do prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userProfile?.id,
    userProfile?.role,
    userProfile?.is_leader,
    userProfile?.operator_code,
    userProfile?.operatorCode,
    userProfile?.name,
    externalData,
    refDate,
  ]);

  // Perdido (denominador da Tx Conversão) do mês filtrado. No mês corrente o mapa já
  // vem pronto do App; em outro mês precisa ser buscado do 1º ao último dia dele.
  useEffect(() => {
    if (isMesCorrente) { setPerdidoMapMes(null); return; }

    let cancelled = false;
    const y = refDate.getFullYear();
    const m = String(refDate.getMonth() + 1).padStart(2, '0');
    const ultimoDia = new Date(y, refDate.getMonth() + 1, 0).getDate();
    const inicio = `${y}-${m}-01`;
    const fim = `${y}-${m}-${String(ultimoDia).padStart(2, '0')}`;

    setPerdidoMapMes(null);
    (async () => {
      try {
        const { buildPerdidoMap } = await import("@/lib/perdido-map");
        const map = await buildPerdidoMap(inicio, fim);
        if (!cancelled) setPerdidoMapMes(map);
      } catch (err) {
        console.error("Erro ao carregar perdido do mês:", err);
        if (!cancelled) setPerdidoMapMes(new Map());
      }
    })();

    return () => { cancelled = true; };
  }, [refDate, isMesCorrente]);

  useEffect(() => {
    setActiveQuote(prev => getRandomQuote(prev));
  }, [selectedCod, getRandomQuote]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    }, 1000 * 30);
    return () => clearInterval(timer);
  }, []);



  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Bom dia";
    if (hr < 18) return "Boa tarde";
    return "Boa noite";
  };

  // Modal full screen não tem backdrop clicável — o Esc é a saída além do X.
  useEffect(() => {
    if (!isAllOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsAllOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAllOpen]);

  const calculateEquilibrio = () => calcEquilibrio(data, refDate);

  const getDiasRestantes = () => getDiasUteisRestantes(refDate);

  const calculateDiarioNecessario = () => calcDiarioNecessario(data, refDate);

  const metrics = data ? [
    { label: m("Meta"), value: formatBRL(data.META), icon: Target, valueColor: "text-slate-900" },
    { label: m("Faltante"), value: formatBRL(data.FALTANTE), icon: ArrowDownRight, valueColor: Number(data.FALTANTE) <= 0 ? "text-emerald-600" : "text-rose-600" },
    { label: m("Faturado"), value: formatBRL(data.FATURADO), icon: Clock, valueColor: "text-emerald-600" },
    { label: m("Em Aberto"), value: formatBRL(data.EM_ABERTO), icon: Clock, valueColor: "text-amber-600" },
    { label: m("Total"), value: formatBRL(data.TOTAL), icon: TrendingUp, valueColor: "text-slate-900" },
    { label: m("Equilíbrio"), value: formatBRL(calculateEquilibrio()), icon: BarChart3, valueColor: "text-blue-600" },
    { label: m("Dias Restantes"), value: `${getDiasRestantes()}`, icon: Calendar, valueColor: "text-slate-900" },
    { label: m("Diário"), value: formatBRL(calculateDiarioNecessario()), icon: Zap, valueColor: "text-slate-900" },
    { label: m("Diária Realizada"), value: formatBRL(calcDiariaPraticada(data, refDate)), icon: Zap, valueColor: "text-cyan-600" },
    { label: m("Projeção"), value: formatBRL(calcProjecao(data, refDate)), icon: TrendingUp, valueColor: calcProjecao(data, refDate) >= Number(data.META || 0) ? "text-emerald-600" : "text-rose-600" },
    { label: m("Tx Conversão"), // Uma casa decimal, igual à rosca "Por Valor" da tela de Orçamentos.
      value: perdidoMap ? `${calcTaxaConversao(data, perdidoMap, teamCodes).toFixed(1)}%` : "—", icon: PieChart, valueColor: "text-blue-600" },
    { label: m("Ticket Médio"), value: formatBRL(data.TICKET_MEDIO), icon: DollarSign, valueColor: "text-slate-900" },
    { label: m("Margem Real"), value: `${Number(data.MARGEM_REAL_PERC || data.MARGEM_PCT || 0).toFixed(2)}%`, icon: TrendingUp, valueColor: "text-blue-600" },
    { label: m("Prazo Médio"), value: `${Number(data.PRAZO_MEDIO_DIAS || 0).toFixed(0)} d`, icon: Clock, valueColor: "text-slate-900" },
  ] : [];

  function m(text: string) { return text; }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-8 animate-pulse">
        <div className="flex justify-center flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800" />
          <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded" />
          <div className="h-10 w-full bg-secondary/50 dark:bg-slate-800/50 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex gap-2">
              <div className="w-8 h-8 bg-secondary/50 dark:bg-slate-800/50 rounded-lg" />
              <div className="space-y-2 flex-1">
                <div className="h-1.5 w-1/2 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-2 w-3/4 bg-secondary/30 dark:bg-slate-800/30 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const equilibrio = calculateEquilibrio();
  const total = data ? (typeof data.TOTAL === 'string' ? parseFloat(data.TOTAL) : data.TOTAL) : 0;
  const percentageVsEquilibrio = equilibrio > 0 ? (Number(total) / equilibrio) * 100 : 0;
  const metaNum = Number(data?.META || 0);
  const atingimento = metaNum > 0 ? (Number(total) / metaNum) * 100 : 0;
  const diffMeta = metaNum - Number(total);

  // Progresso da loja
  const storeTotal = storeData ? (typeof storeData.TOTAL === 'string' ? parseFloat(storeData.TOTAL) : (storeData.TOTAL || 0)) : 0;
  const storeMeta = Number(storeData?.META || 0);
  const storeAtingimento = storeMeta > 0 ? (storeTotal / storeMeta) * 100 : 0;
  const showStoreBar = !!(storeData && storeMeta > 0 && storeAtingimento !== atingimento);

  const roleUpper = userProfile?.role?.toUpperCase() || "";
  const canChangeSeller = roleUpper.includes("DIRETOR") || 
                          roleUpper.includes("GERENTE") || 
                          roleUpper === "ADMIN" ||
                          roleUpper.includes("SUPERVISOR") ||
                          (userProfile?.is_leader === true && allVendedores.length > 0);

  return (
    <div 
      ref={cardRef}
      className={cn(
        "bg-card border border-border rounded-xl shadow-sm flex flex-col",
        isCompact ? "p-4" : "p-5"
      )}
    >
      {/* 1. HEADER (Com controles de Stories) */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border/10">
        <div className="z-10 flex-shrink-0 flex flex-col items-center gap-0.5 justify-start">
          {!showSocial && (
            <button
              onClick={openStats}
              className="p-1.5 rounded-lg transition-all hover:bg-secondary"
              title="Estatísticas diárias"
            >
              <Activity className="w-4 h-4 text-blue-500" />
            </button>
          )}
          {!showSocial && canChangeSeller && (
            <button
              onClick={() => setIsAllOpen(true)}
              className="p-1.5 rounded-lg transition-all hover:bg-secondary"
              title="Ver todos os vendedores"
            >
              <LayoutGrid className="w-4 h-4 text-slate-400 hover:text-blue-500 transition-colors" />
            </button>
          )}
        </div>
        <div className="flex-1 text-center min-w-0 px-1">
          {!showSocial && canChangeSeller && selectedCod !== "TOTAL" && data?.NOME_VENDEDOR && (
            <span className="text-[10px] font-black uppercase tracking-tighter truncate block text-blue-600 dark:text-blue-400">
              {data.NOME_VENDEDOR}
            </span>
          )}
        </div>
        <div className="relative z-10 flex-shrink-0 flex flex-col items-center gap-0.5 justify-start">
          <button
            onClick={() => {
              const next = !showSocial;
              setShowSocial(next);
              if (next) {
                setActiveQuote(prev => getRandomQuote(prev));
              }
            }}
            className={cn(
              "p-1.5 rounded-lg transition-all",
              showSocial ? "text-amber-400 hover:bg-secondary" : "text-slate-400 hover:text-amber-500 hover:bg-secondary"
            )}
            title={showSocial ? "Ver Métricas" : "Ver Stories Motivacional"}
          >
            <Star className="w-4 h-4 fill-current" />
          </button>

          {showSocial && (
            <button
              onClick={sendPanelPhoto}
              disabled={isSendingPhoto}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                isSendingPhoto ? "text-blue-500 hover:bg-secondary" : "text-slate-400 hover:text-blue-500 hover:bg-secondary"
              )}
              title="Enviar painel para meu WhatsApp"
            >
              {isSendingPhoto ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
          )}

          {canChangeSeller && (
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                "p-1.5 rounded-lg transition-all hover:bg-secondary",
                isDropdownOpen && "bg-secondary"
              )}
            >
              <MoreHorizontal className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
              <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Selecionar Vendedor</span>
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-hide">
                  <button
                    onClick={() => {
                      const mediaRow = allVendedores.find(r => r.COD_VENDEDOR === "MEDIA");
                      if (mediaRow) {
                        setSelectedCod("MEDIA");
                        setData(mediaRow);
                      }
                      setIsDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full px-4 py-2 text-left text-xs font-bold transition-colors hover:bg-secondary flex items-center justify-between",
                      selectedCod === "MEDIA" ? "text-blue-600 bg-blue-50/50 dark:bg-blue-900/20" : "text-foreground"
                    )}
                  >
                    <span>Total Geral</span>
                    {selectedCod === "MEDIA" && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                  </button>

                  {(() => {
                    const rest = allVendedores.filter(v => v.COD_VENDEDOR !== "MEDIA");
                    const times = rest
                      .filter(v => v.COD_VENDEDOR.startsWith("TEAM:"))
                      .filter(v => Number(v.META) > 0)
                      .sort((a, b) => (parseFloat(String(b.FATURADO)) || 0) - (parseFloat(String(a.FATURADO)) || 0));
                    const vendedores = rest
                      .filter(v => !v.COD_VENDEDOR.startsWith("TEAM:"))
                      .sort((a, b) => (a.NOME_VENDEDOR || "").localeCompare(b.NOME_VENDEDOR || ""));

                    const renderBtn = (v: VendedorResumo) => (
                      <button
                        key={v.COD_VENDEDOR}
                        onClick={() => {
                          setSelectedCod(v.COD_VENDEDOR);
                          setData(v);
                          setIsDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full px-4 py-2 text-left text-[11px] font-bold transition-colors hover:bg-secondary flex items-center justify-between",
                          selectedCod === v.COD_VENDEDOR ? "text-blue-600 bg-blue-50/50 dark:bg-blue-900/20" : "text-slate-600 dark:text-slate-300"
                        )}
                      >
                        <span className="truncate uppercase pr-2">{(v.NOME_VENDEDOR || "").trim().split(/\s+/).slice(0, 2).join(" ")}</span>
                        {selectedCod === v.COD_VENDEDOR && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                      </button>
                    );

                    const label = (t: string) => (
                      <div className="px-4 pt-2 pb-1 text-[9px] font-black text-muted-foreground uppercase tracking-widest">{t}</div>
                    );

                    return (
                      <>
                        {times.length > 0 && label("Times")}
                        {times.map(renderBtn)}
                        {times.length > 0 && vendedores.length > 0 && label("Vendedores")}
                        {vendedores.map(renderBtn)}
                      </>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative flex-1 flex flex-col justify-start">
        {/* STORIES VIEW */}
        <div className={cn(
          "transition-all duration-500 ease-in-out flex flex-col items-center pt-1 pb-4 px-4 text-center gap-3 origin-center",
          showSocial 
            ? "opacity-100 scale-100 pointer-events-auto" 
            : "opacity-0 scale-95 pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden"
        )}>
          <h2 className="text-base font-black tracking-tight text-foreground">
            {getGreeting()}, {userProfile?.name ? formatNameTitleCase(userProfile.name) : (data?.NOME_VENDEDOR && selectedCod !== "MEDIA" && selectedCod !== "TOTAL" ? formatNameTitleCase(data.NOME_VENDEDOR) : 'Time')}!
          </h2>

          <div className="relative mt-3">
            <div className="w-20 h-20 rounded-full border-2 border-blue-500 p-0.5 bg-background shadow-md overflow-hidden">
              <img
                src={userProfile?.avatar || data?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name || data?.NOME_VENDEDOR || "vendedor"}`}
                alt={userProfile?.name || data?.NOME_VENDEDOR || "Avatar"}
                className="w-full h-full rounded-full object-cover animate-in zoom-in-95 duration-500"
              />
            </div>
          </div>

          <div className="max-w-[270px] flex flex-col items-center">
            <div className="relative px-4 mt-1 text-center">
              <span className="absolute -top-3.5 left-1 text-2xl font-serif text-blue-500/30">“</span>
              <p className="text-[10px] font-black italic text-foreground leading-relaxed">
                {activeQuote?.text}
              </p>
              <span className="absolute -bottom-5 right-1 text-2xl font-serif text-blue-500/30">”</span>
            </div>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60 mt-0.5 block">
              — {activeQuote?.author}
            </span>
          </div>

          <div className="pt-2 pb-1 flex flex-col items-center gap-2.5">
            <span className="text-4xl font-sans font-semibold tracking-tighter text-foreground">
              {currentTime}
            </span>
            <button
              onClick={dismissSocialToday}
              className="mt-1 px-4 py-1.5 rounded-full border border-border/40 hover:border-border/80 active:scale-95 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-secondary/15 transition-all duration-200 flex items-center gap-1.5"
            >
              <span>Bora pra cima</span>
              <Zap className="w-2.5 h-2.5 fill-current text-blue-500" />
            </button>
          </div>
        </div>

        {/* METRICS VIEW */}
        <div className={cn(
          "transition-all duration-500 ease-in-out flex flex-col origin-center",
          !showSocial 
            ? "opacity-100 scale-100 pointer-events-auto" 
            : "opacity-0 scale-95 pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden"
        )}>
          {/* 2. GRÁFICO DE ROSCA (TOP) - META */}
          <div className="mb-3 flex flex-col items-center">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-secondary dark:text-slate-800"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - Math.min(atingimento, 100) / 100)}
                  strokeLinecap="round"
                  fill="transparent"
                  className={cn(
                    "transition-all duration-1000 ease-out",
                    atingimento >= 100 ? "text-blue-600 dark:text-blue-500" : "text-rose-500"
                  )}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-none text-center">
                <span className={cn(
                  "text-2xl font-black tracking-tighter",
                  atingimento >= 100 ? "text-foreground" : "text-rose-600"
                )}>
                  {atingimento.toFixed(0)}%
                </span>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  {metaNum <= 0 
                    ? "Sem Meta" 
                    : (atingimento.toFixed(0) === '100' 
                        ? "Meta Batida" 
                        : (diffMeta > 0 
                            ? `- ${formatBRL(diffMeta)}` 
                            : `+ ${formatBRL(Math.abs(diffMeta))}`
                          )
                      )
                  }
                </span>
              </div>
            </div>
          </div>

          {/* 4. VALOR VENDIDO (MAIS DISCRETO) */}
          <div className="mb-2 flex flex-col items-center text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 font-sans">
              {isMesCorrente
                ? "Total Vendido Hoje"
                : `Total Vendido ${refDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
            </p>
            <h3 className="text-2xl font-black text-foreground tracking-tighter mb-0.5">
              {formatBRL(data?.TOTAL_VENDIDO_HOJE || 0)}
            </h3>
          </div>

          {/* Progress Bar (Equilíbrio) */}
          <div className="mb-4 px-2">
            <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
              <span className="text-blue-600 dark:text-blue-500">Equilíbrio</span>
              <span className="text-foreground">{percentageVsEquilibrio.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full bg-secondary dark:bg-slate-800 rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(37,99,235,0.4)]"
                style={{ width: `${Math.min(percentageVsEquilibrio, 100)}%` }}
              />
            </div>
          </div>

          {/* 4. GRID DE INDICADORES (Sober/Professional) */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            {metrics.map((m, i) => (
              <div key={i} className="flex items-start gap-3 group">
                <div className="mt-0.5 p-1.5 bg-secondary/50 dark:bg-slate-800/50 border border-border rounded-lg shrink-0 transition-colors group-hover:bg-card group-hover:border-slate-400/20">
                  <m.icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider truncate mb-0.5">{m.label}</span>
                  <span className={cn("text-xs font-black tracking-tight", m.valueColor.includes('slate-900') ? 'text-foreground' : m.valueColor)}>
                    {m.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 5. PROGRESSO DA LOJA */}
          {showStoreBar && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                <span className="text-blue-600 dark:text-blue-400">Meta da Loja</span>
                <span className={cn(
                  "font-black",
                  storeAtingimento >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                )}>
                  {storeAtingimento.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full bg-secondary dark:bg-slate-800 rounded-full overflow-hidden border border-border">
                <div
                  className={cn(
                    "h-full rounded-full bar-fluid",
                    storeAtingimento >= 100 ? "bar-fluid-emerald" : "bar-fluid-blue"
                  )}
                  style={{ width: `${Math.min(storeAtingimento, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL COM O CARD DE TODOS OS VENDEDORES
          Vai via portal no body: o painel direito é um container `fixed z-40`,
          que cria um stacking context próprio — dentro dele nenhum z-index
          consegue passar por cima da sidebar (z-50). */}
      {isAllOpen && createPortal(
        <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in duration-200">
          {/* Modal Header */}
          <div className="shrink-0 bg-card/95 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                <LayoutGrid className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Todos os Vendedores</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {refDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => { setPickerYear(refDate.getFullYear()); setIsDateModalOpen(!isDateModalOpen); }}
                  className={cn(
                    "h-10 px-4 rounded-xl border text-[10px] font-black uppercase tracking-tight flex items-center gap-2 transition-all outline-none capitalize",
                    "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/20 text-blue-600 dark:text-blue-400 shadow-sm",
                    isDateModalOpen && "ring-4 ring-blue-500/5 border-blue-500/50"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5 opacity-40 shrink-0" />
                  <span className="truncate max-w-[160px]">
                    {refDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform duration-300 opacity-40 shrink-0", isDateModalOpen && "rotate-180")} />
                </button>
                {isDateModalOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsDateModalOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 z-50 w-64 bg-card border border-border rounded-2xl shadow-2xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <button onClick={() => setPickerYear((y) => y - 1)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <span className="text-sm font-black text-foreground tabular-nums">{pickerYear}</span>
                        <button
                          onClick={() => setPickerYear((y) => Math.min(y + 1, new Date().getFullYear()))}
                          disabled={pickerYear >= new Date().getFullYear()}
                          className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((nome, m) => {
                          const hoje = new Date();
                          const futuro = pickerYear > hoje.getFullYear() || (pickerYear === hoje.getFullYear() && m > hoje.getMonth());
                          const ativo = refDate.getFullYear() === pickerYear && refDate.getMonth() === m;
                          return (
                            <button
                              key={nome}
                              disabled={futuro}
                              onClick={() => {
                                const ehMesAtual = pickerYear === hoje.getFullYear() && m === hoje.getMonth();
                                const dia = ehMesAtual ? hoje.getDate() : new Date(pickerYear, m + 1, 0).getDate();
                                setRefDate(new Date(pickerYear, m, dia, 12, 0, 0));
                                setIsDateModalOpen(false);
                              }}
                              className={cn(
                                "h-9 rounded-lg text-[11px] font-black uppercase tracking-tight transition-colors",
                                ativo
                                  ? "bg-blue-600 text-white"
                                  : "text-foreground hover:bg-secondary disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                              )}
                            >
                              {nome}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => setIsAllOpen(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors" title="Fechar (Esc)">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {allVendedores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-40">
                <LayoutGrid className="w-8 h-8 text-muted-foreground" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Nenhum vendedor disponível</span>
              </div>
            ) : (
              (() => {
                const totalGeral = allVendedores.find(v => v.COD_VENDEDOR === "MEDIA");
                const rest = allVendedores.filter(v => v.COD_VENDEDOR !== "MEDIA");
                // Sem meta cadastrada não há ritmo nem atingimento para comparar: o card
                // sairia 0% / 0% e só ocuparia espaço na grade (vale para times e vendedores).
                const times = rest
                  .filter(v => v.COD_VENDEDOR.startsWith("TEAM:"))
                  .filter(v => Number(v.META) > 0)
                  .sort((a, b) => (parseFloat(String(b.FATURADO)) || 0) - (parseFloat(String(a.FATURADO)) || 0));
                // Maior ritmo primeiro — no modal o comparativo é mais útil que a ordem alfabética.
                const vendedores = rest
                  .filter(v => !v.COD_VENDEDOR.startsWith("TEAM:"))
                  .filter(v => Number(v.META) > 0)
                  .sort((a, b) => calcPercentVsEquilibrio(b, refDate) - calcPercentVsEquilibrio(a, refDate));

                const select = (v: VendedorResumo) => {
                  setSelectedCod(v.COD_VENDEDOR);
                  setData(v);
                  setIsAllOpen(false);
                };

                const grid = (rows: VendedorResumo[]) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
                    {rows.map(v => (
                      <VendedorMiniCard
                        key={v.COD_VENDEDOR}
                        row={v}
                        perdidoMap={perdidoMap}
                        refDate={refDate}
                        isActive={selectedCod === v.COD_VENDEDOR}
                        onSelect={() => select(v)}
                      />
                    ))}
                  </div>
                );

                const label = (t: string) => (
                  <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-3">{t}</div>
                );

                // Total Geral e times dividem a mesma grade: sozinho, o Total Geral
                // ocupava uma célula e deixava o resto da linha vazio. Os próprios
                // cards se identificam (nome + selo "Time"), então um rótulo basta.
                const consolidado = [...(totalGeral ? [totalGeral] : []), ...times];

                return (
                  <div className="space-y-8 max-w-[1800px] mx-auto">
                    {consolidado.length > 0 && (
                      <div>
                        {label(times.length > 0 ? "Total Geral e Times" : "Total Geral")}
                        {grid(consolidado)}
                      </div>
                    )}
                    {vendedores.length > 0 && (
                      <div>
                        {label("Vendedores")}
                        {grid(vendedores)}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DE ESTATÍSTICAS DIÁRIAS */}
      {isStatsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsStatsOpen(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-[95vw] max-w-[700px] max-h-[85vh] overflow-y-auto z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Estatísticas Diárias</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                    {selectedCod !== "MEDIA" && selectedCod !== "TOTAL" && data?.NOME_VENDEDOR ? ` — ${data.NOME_VENDEDOR}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsStatsOpen(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-8">
              {statsLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 animate-pulse">
                  <div className="w-12 h-12 rounded-2xl bg-secondary/50 dark:bg-slate-800/50" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Carregando dados...</span>
                </div>
              ) : vendasDiarias.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-40">
                  <Activity className="w-8 h-8 text-muted-foreground" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sem dados para o período</span>
                </div>
              ) : (
                <>
                  {/* Controles de Filtros Estilo Nubank */}
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    {/* Filtro de Métrica */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStatsTab('vendido')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-black rounded-full border transition-all duration-200 flex items-center gap-1.5",
                          statsTab === 'vendido'
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground bg-secondary/30"
                        )}
                      >
                        {statsTab === 'vendido' && <span className="text-[10px]">✓</span>}
                        Vendido
                      </button>
                      <button
                        onClick={() => setStatsTab('faturado')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-black rounded-full border transition-all duration-200 flex items-center gap-1.5",
                          statsTab === 'faturado'
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground bg-secondary/30"
                        )}
                      >
                        {statsTab === 'faturado' && <span className="text-[10px]">✓</span>}
                        Faturado
                      </button>
                    </div>

                    {/* Filtro de Período */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPeriodTab('mes')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-black rounded-full border transition-all duration-200 flex items-center gap-1.5",
                          periodTab === 'mes'
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground bg-secondary/30"
                        )}
                      >
                        {periodTab === 'mes' && <span className="text-[10px]">✓</span>}
                        Mês Atual
                      </button>
                      <button
                        onClick={() => setPeriodTab('7dias')}
                        className={cn(
                          "px-4 py-1.5 text-xs font-black rounded-full border transition-all duration-200 flex items-center gap-1.5",
                          periodTab === '7dias'
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground bg-secondary/30"
                        )}
                      >
                        {periodTab === '7dias' && <span className="text-[10px]">✓</span>}
                        Últimos 7 dias
                      </button>
                    </div>
                  </div>

                  {/* Gráfico Unificado Estilo Nubank */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        {statsTab === 'vendido' ? 'Total Vendido por Dia' : 'Faturado por Dia'}
                      </span>
                    </div>
                    <div className="h-56 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                      <div className="h-full min-w-[500px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={filteredData.map(d => ({ ...d, dia: new Date(d.DIA + 'T00:00:00').getDate().toString().padStart(2, '0') }))} barCategoryGap={periodTab === '7dias' ? "6%" : "12%"}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.3} />
                            <XAxis dataKey="dia" tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} width={40} />
                            <Tooltip
                              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--foreground))' }}
                              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                              itemStyle={{ color: '#3b82f6' }}
                              formatter={(value: unknown) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value)), statsTab === 'vendido' ? 'Total Vendido' : 'Faturado']}
                              labelFormatter={(label) => `Dia ${label}`}
                              cursor={{ fill: 'rgba(59, 130, 246, 0.08)', radius: 6 }}
                            />
                            <Bar dataKey={statsTab === 'vendido' ? 'TOTAL_VENDIDO' : 'FATURADO'} fill="#3b82f6" radius={periodTab === '7dias' ? [20, 20, 0, 0] : [8, 8, 0, 0]} maxBarSize={periodTab === '7dias' ? 90 : 32} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmployeeOfMonthCard({ loading: externalLoading }: { loading?: boolean }) {
  const [employee, setEmployee] = useState<{ name: string; role: string; department: string; achievement: string; avatar: string } | null>(null);
  const [internalLoading, setInternalLoading] = useState(true);

  const loading = externalLoading !== undefined ? externalLoading : internalLoading;
  
  useEffect(() => {
    async function fetchHighlight() {
      const now = new Date();
      const mesanoISO = now.toISOString().slice(0, 7); // '2026-04'
      const currentMonthNum = now.getMonth();

      try {
        setInternalLoading(true);

        // Agora usamos apenas a Automação, já que a tabela física foi removida
        const winner = await calculateMonthlyWinner(mesanoISO); 
        if (winner) {
           setEmployee({
             name: winner.name,
             role: winner.role || "Destaque",
             department: winner.department,
             achievement: winner.motivo,
             avatar: winner.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${winner.name}`
           });
           return;
        }

        // 3. Lógica Automática Híbrida (Fallback Visual)
        const sectors = ["Comercial", "Logística", "Social"];
        const focusSector = sectors[currentMonthNum % sectors.length];

        if (focusSector === "Comercial") {
          try {
            const sellersData = await apiCampanhaMetas(mesanoISO.replace("-", ""));
            const topSeller = (sellersData.resumo || [])
              .filter(v => Number(v.FATURAMENTO) > 0)
              .sort((a, b) => Number(b.FATURAMENTO) - Number(a.FATURAMENTO))[0];

            if (topSeller) {
              setEmployee({
                name: topSeller.NOME_VENDEDOR,
                role: "Consultor de Vendas",
                department: "Comercial",
                achievement: `Líder de faturamento do mês, atingindo R$ ${Number(topSeller.FATURAMENTO).toLocaleString("pt-BR")}.`,
                avatar: topSeller.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${topSeller.COD_VENDEDOR}`
              });
              return;
            }
          } catch (err) {
            console.warn("Fallback: Falha na API comercial, tentando social...", err);
          }
        } else if (focusSector === "Logística") {
          try {
            const deliveries = await apiEntregasConcluidas();
            if (deliveries.success && deliveries.data.length > 0) {
              const driver = deliveries.data[0];
              setEmployee({
                name: "Equipe de Logística",
                role: "Operacional",
                department: "Expedição",
                achievement: `Eficiência recorde na entrega NF ${driver.NF}, garantindo prazos e satisfação do cliente.`,
                avatar: `https://api.dicebear.com/7.x/shapes/svg?seed=logistics`
              });
              return;
            }
          } catch (err) {
            console.warn("Fallback: Falha na API logística, tentando social...", err);
          }
        } 
        
        // Social/Geral Fallback (Sempre funciona como última opção)
        const { data: users } = await supabase.from("usuarios").select("name, avatar, department, role").limit(20);
        if (users && users.length > 0) {
          const u = users[currentMonthNum % users.length];
          setEmployee({
            name: u.name,
            role: u.role || "Especialista",
            department: u.department || "Carflax",
            achievement: "Exemplo de proatividade e colaboração intersetorial durante este mês.",
            avatar: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`
          });
        }
      } catch (err) {
        console.error("Erro destaque fatal:", err);
      } finally {
        setInternalLoading(false);
      }
    }

    fetchHighlight();
  }, []);

  if (loading || !employee) {
    return (
      <div className="flex-1 flex flex-col min-h-[320px] bg-card border border-border rounded-2xl shadow-sm overflow-hidden animate-pulse">
        <div className="h-20 bg-slate-100 dark:bg-slate-800 shrink-0" />
        <div className="flex-1 flex flex-col items-center px-6 -mt-10 relative z-10 pb-6 space-y-4">
           <div className="w-24 h-24 rounded-3xl bg-card p-1.5 shadow-xl">
             <div className="w-full h-full rounded-2xl bg-secondary/50 dark:bg-slate-800/50" />
           </div>
           <div className="text-center space-y-2 w-full">
              <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-800 rounded mx-auto" />
              <div className="h-3 w-1/2 bg-secondary/30 dark:bg-slate-800/30 rounded mx-auto" />
           </div>
           <div className="w-full h-24 bg-secondary/10 dark:bg-slate-800/20 rounded-2xl" />
        </div>
      </div>
    );
  }


  return (
    <div className="flex-1 flex flex-col min-h-[320px] bg-card border border-border rounded-2xl shadow-sm overflow-hidden group transition-all duration-500 hover:shadow-xl hover:shadow-blue-900/5 hover:border-blue-200">
      {/* Header Banner - Carflax Blue - Reduced height */}
      <div className="h-20 bg-gradient-to-br from-blue-700 to-blue-600 relative overflow-hidden flex items-center justify-center shrink-0">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(30deg, #000 12%, transparent 12.5%, transparent 87%, #000 87.5%, #000), linear-gradient(150deg, #000 12%, transparent 12.5%, transparent 87%, #000 87.5%, #000), linear-gradient(30deg, #000 12%, transparent 12.5%, transparent 87%, #000 87.5%, #000), linear-gradient(150deg, #000 12%, transparent 12.5%, transparent 87%, #000 87.5%, #000), linear-gradient(60deg, #999 25%, transparent 25.5%, transparent 75%, #999 75%, #999), linear-gradient(60deg, #999 25%, transparent 25.5%, transparent 75%, #999 75%, #999)", backgroundSize: "80px 140px" }} />
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16" />
        

      </div>

      {/* Main Content Area - Reduced negative margin */}
      <div className="flex-1 flex flex-col items-center px-6 -mt-10 relative z-10 pb-6">
        {/* Avatar Spotlight - Reduced bottom margin */}
        <div className="relative mb-3 group-hover:scale-105 transition-transform duration-500">
          <div className="w-24 h-24 rounded-3xl bg-card p-1.5 shadow-xl shadow-blue-950/20 border border-border overflow-hidden">
            <div className="w-full h-full rounded-2xl overflow-hidden bg-secondary dark:bg-slate-800 border border-border">
              <img src={employee.avatar} className="w-full h-full object-cover" alt={employee.name} />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 rounded-lg flex items-center justify-center border-2 border-card shadow-lg">
            <Star className="w-3 h-3 text-white fill-current" />
          </div>
        </div>

        {/* Info Block - Reduced bottom margin */}
        <div className="text-center w-full mb-4">
          <h4 className="text-lg font-black text-foreground uppercase tracking-tighter leading-tight mb-1">
            {employee.name}
          </h4>
          <div className="flex items-center justify-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[9px] font-bold uppercase tracking-widest border border-blue-100/30">
              {employee.role}
            </span>
          </div>
        </div>

        {/* Achievement Quote - Compact */}
        <div className="w-full bg-slate-50/50 dark:bg-secondary/30 backdrop-blur-md rounded-2xl p-4 border border-slate-100 dark:border-border flex flex-col relative overflow-hidden group/quote">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/50 rounded-full blur-2xl -mr-8 -mt-8" />
          
          <div className="flex items-start gap-2 mb-2 relative z-10">
            <Zap className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Motivo do Prêmio</span>
          </div>
          
          <p className="text-[11px] font-bold text-slate-700 dark:text-muted-foreground leading-relaxed italic relative z-10 line-clamp-3">
            "{employee.achievement}"
          </p>
        </div>


      </div>
    </div>
  );
}



export function WeatherTrafficCard() {
  const [weather] = useState({ temp: 24, condition: "Partly Cloudy", city: "São Paulo" });
  
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col gap-4 overflow-hidden relative group cursor-pointer">
      {/* Background Gradient Effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-900/20 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-700 opacity-50" />
      
      <div className="flex items-center justify-between relative z-10">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
          Clima e Trânsito
        </h4>
        <Sun className="w-3.5 h-3.5 text-amber-500" />
      </div>

      <div className="flex items-center gap-4 relative z-10">
        <div className="flex flex-col">
          <span className="text-3xl font-black text-foreground tracking-tighter leading-none">{weather.temp}°C</span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5">{weather.city}</span>
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-tight">Céu Limpo</span>
          <span className="text-[10px] font-medium text-muted-foreground mt-0.5">Sem previsão de chuva</span>
        </div>
      </div>

      <div className="pt-3 border-t border-border flex flex-col gap-2 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-foreground uppercase">Trânsito Fluindo</span>
          </div>
          <span className="text-[9px] font-medium text-muted-foreground">Normal</span>
        </div>
        <div className="w-full h-1 bg-secondary dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="w-3/4 h-full bg-emerald-500 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ActiveVacationsCard({ loading: externalLoading }: { loading?: boolean }) {
  const [vacations, setVacations] = useState<{ id: string | number; name: string; avatar: string; end_date: string }[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);

  const loading = externalLoading !== undefined ? externalLoading : internalLoading;

  useEffect(() => {
    async function fetchVacations() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
          .from("ferias")
          .select("*")
          .lte("start_date", today)
          .gte("end_date", today);

        if (error) throw error;
        setVacations(data || []);
      } catch (err) {
        console.error("Erro ferias:", err);
      } finally {
        setInternalLoading(false);
      }
    }
    fetchVacations();
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col min-h-[140px]">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
          Em Férias Agora
        </h4>
        <Plane className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 opacity-50" />
      </div>

      {loading ? (
        <div className="flex gap-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="h-1.5 w-8 bg-secondary/50 dark:bg-slate-800/50 rounded" />
            </div>
          ))}
        </div>
      ) : vacations.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {vacations.map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 group cursor-pointer">
              <div className="w-10 h-10 rounded-full border-2 border-blue-100 dark:border-blue-900/50 p-0.5 transition-transform group-hover:scale-110">
                <img 
                  src={v.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.name}`} 
                  alt={v.name} 
                  className="w-full h-full rounded-full object-cover" 
                />
              </div>
              <span className="text-[9px] font-bold text-muted-foreground truncate max-w-[50px]">{v.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-4 text-center opacity-40">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Toda equipe ativa</span>
        </div>
      )}
    </div>
  );
}

export function UpcomingEventsCard({ loading: externalLoading, operatorCode }: { loading?: boolean; operatorCode?: string }) {
  const [events, setEvents] = useState<{ id: string | number; title: string; day: number; month: number; year: number; type: string }[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);

  const loading = externalLoading !== undefined ? externalLoading : internalLoading;

  useEffect(() => {
    async function fetchEvents() {
      try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();

        const myCode = String(operatorCode || "").replace(/^0+/, '');

        let query = supabase
          .from("eventos_calendario")
          .select("*")
          .gte("year", currentYear)
          .order("year", { ascending: true })
          .order("month", { ascending: true })
          .order("day", { ascending: true });

        if (myCode) {
          query = query.or(`vendedor_codigo.eq.${myCode},vendedor_codigo.is.null`);
        }

        const { data, error } = await query;

        if (error) throw error;

        const upcoming = (data || []).filter(ev => {
          if (ev.year > currentYear) return true;
          if (ev.year === currentYear) {
            if (ev.month > currentMonth) return true;
            if (ev.month === currentMonth) return ev.day >= currentDay;
          }
          return false;
        }).slice(0, 3);

        setEvents(upcoming);
      } catch (err) {
        console.error("Erro events:", err);
      } finally {
        setInternalLoading(false);
      }
    }
    fetchEvents();
  }, [operatorCode]);

  const getTypeStyle = (type: string) => {
    switch (type) {
      case "meeting": return { icon: Users, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-900/30" };
      case "important": return { icon: AlertCircle, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-900/30" };
      case "finance": return { icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30" };
      case "holiday": return { icon: Flag, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30" };
      case "celebration": return { icon: Trophy, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-900/30" };
      default: return { icon: Calendar, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30" };
    }
  };

  const getDaysDiff = (day: number, month: number, year: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(year, month - 1, day);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col group min-h-[160px]">
      {!loading && (
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div className="flex flex-col">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none mb-1">
              Agenda
            </h4>
            <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Próximos Eventos</h3>
          </div>
          <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center border border-border">
            <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2].map(i => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-2 w-3/4 bg-slate-100 dark:bg-slate-800 rounded" />
                  <div className="h-1.5 w-1/4 bg-secondary/50 dark:bg-slate-800/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-4">
            {events.map((ev, i) => {
              const style = getTypeStyle(ev.type);
              const daysDiff = getDaysDiff(ev.day, ev.month, ev.year);
              
              return (
                <div key={i} className="flex gap-4 group/item items-start">
                  <div className={cn("mt-0.5 p-2 rounded-xl shrink-0 transition-transform group-hover/item:scale-110", style.bg)}>
                    <style.icon className={cn("w-4 h-4", style.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                       <p className="text-xs font-black text-foreground uppercase tracking-tight truncate flex-1 group-hover/item:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {ev.title}
                      </p>
                      {daysDiff >= 0 && (
                        <span className={cn(
                          "ml-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md shrink-0 border",
                          daysDiff === 0 ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50" :
                          daysDiff === 1 ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50" :
                          "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/50"
                        )}>
                          {daysDiff === 0 ? "HOJE" :
                           daysDiff === 1 ? "AMANHÃ" : 
                           `EM ${daysDiff} DIAS`}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                      {ev.day.toString().padStart(2, '0')}/{ev.month.toString().padStart(2, '0')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center opacity-40">
            <div className="w-12 h-12 bg-secondary/50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center mb-3">
               <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Sem eventos próximos</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function BirthdayList({ loading: externalLoading }: { loading?: boolean }) {
  const [birthdays, setBirthdays] = useState<{ name: string; date: string; img: string; day: number }[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);

  const loading = externalLoading !== undefined ? externalLoading : internalLoading;

  useEffect(() => {
    async function fetchBirthdays() {
      try {
        const { data, error } = await supabase
          .from("usuarios")
          .select("name, avatar, birth_date")
          .not("birth_date", "is", null);

        if (error) throw error;

        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1-indexed

        const filtered = (data || [])
          .filter(u => {
            if (!u.birth_date) return false;
            const parts = u.birth_date.split("-");
            const m = parseInt(parts[1]);
            return m === currentMonth;
          })
          .map(u => {
            const parts = u.birth_date.split("-");
            const m = parts[1];
            const d = parts[2];
            return {
              name: u.name,
              date: `${d}/${m}`,
              day: parseInt(d),
              img: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`
            };
          })
          .sort((a, b) => a.day - b.day);

        setBirthdays(filtered);
      } catch (err) {
        console.error("Erro ao carregar aniversariantes:", err);
      } finally {
        setInternalLoading(false);
      }
    }

    fetchBirthdays();
  }, []);

  return (
    <div className="flex-1 bg-card border border-border rounded-2xl p-5 shadow-sm flex flex-col overflow-hidden group min-h-[160px]">
      {!loading && (
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div className="flex flex-col">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none mb-1">
              Social
            </h4>
            <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Aniversariantes</h3>
          </div>
          <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center border border-border">
            <Gift className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide pr-1 -mr-1">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-2 w-1/2 bg-slate-100 dark:bg-slate-800 rounded" />
                  <div className="h-1.5 w-1/3 bg-secondary/50 dark:bg-slate-800/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : birthdays.length > 0 ? (
          <div className="space-y-4 pt-2 px-1">
            {birthdays.map((bd, i) => {
              const today = new Date().getDate();
              const isToday = bd.day === today;
              const isPast = bd.day < today;
              
              return (
                <div key={i} className="flex items-center gap-3 group/item cursor-pointer">
                  <div className="relative shrink-0 pt-1 pr-1">
                    <div className="w-10 h-10 rounded-xl bg-secondary/50 dark:bg-slate-800/50 border border-border overflow-hidden p-0.5 group-hover/item:border-blue-200 transition-colors">
                      <img 
                        src={bd.img || `https://api.dicebear.com/7.x/avataaars/svg?seed=${bd.name}`} 
                        alt={bd.name} 
                        className="w-full h-full rounded-lg object-cover" 
                      />
                    </div>
                    {/* Only show ping for today or upcoming */}
                    {!isPast && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 rounded-full border-2 border-card flex items-center justify-center">
                        <div className={cn("w-1 h-1 bg-white rounded-full", isToday && "animate-ping")} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-foreground uppercase tracking-tight truncate group-hover/item:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {bd.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{bd.date}</span>
                      <span className="w-1 h-1 rounded-full bg-secondary/50" />
                      {isToday ? (
                        <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-md">Hoje!</span>
                      ) : isPast ? (
                        <span className="text-[9px] font-medium text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-md">Já foi</span>
                      ) : (
                        <span className="text-[9px] font-medium text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md">Próximo</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center opacity-40">
            <div className="w-12 h-12 bg-secondary/50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center mb-3">
               <Gift className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Nenhum Aniversariante</p>
          </div>
        )}
      </div>

    </div>
  );
}
