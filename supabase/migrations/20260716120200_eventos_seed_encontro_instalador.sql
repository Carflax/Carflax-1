-- Seed do "Encontro do Instalador Carflax" (15/10/2026), a partir do plano de ação.
-- Idempotente: se o evento já existe pelo nome, não faz nada.
--
-- Fornecedores: o plano prevê 12 marcas (6 hidráulicas + 6 elétricas), mas só
-- nomeia a Amanco. As outras 11 ficam para o marketing cadastrar na tela — não
-- dá para semear nome que o documento não traz.

do $$
declare
  v_evento_id uuid;
begin
  if exists (select 1 from public.eventos where nome = 'Encontro do Instalador Carflax') then
    return;
  end if;

  insert into public.eventos (
    nome, subtitulo, descricao, data_evento, hora_inicio, hora_fim, local,
    publico_meta_min, publico_meta_max, convidados_meta, verba_meta, status
  ) values (
    'Encontro do Instalador Carflax',
    'Dia do Eletricista (17/10) + Dia do Encanador (27/10) — um único grande evento',
    'Grande encontro unificando os profissionais dos segmentos hidráulico e elétrico, '
      'promovendo uma experiência completa para clientes, fornecedores e parceiros, com foco '
      'em relacionamento, reativação de clientes e venda no balcão. Café da Manhã do Instalador, '
      'aproveitando o hábito de passar na loja antes da obra: o cliente participa do café, vê as '
      'demonstrações, retira o kit, concorre aos sorteios e sai comprando material para o dia.',
    date '2026-10-15', time '07:30', time '10:00', 'Galpão da Carflax',
    60, 80, 100, 19000.00, 'planejamento'
  ) returning id into v_evento_id;

  -- Única marca nomeada no plano. Cota confidencial, contrapartidas discretas.
  insert into public.evento_fornecedores (
    evento_id, marca, segmento, status, cota_valor, cota_confidencial,
    apoio_master, premio_valor, brindes_qtd, observacoes
  ) values (
    v_evento_id, 'Amanco', 'hidraulico', 'confirmado', 8000.00, true,
    true, 200.00, 80,
    'Tratativa reservada: valor da cota é confidencial e não deve ser mencionado a nenhum outro '
      'fornecedor. Contrapartidas proporcionais, porém discretas — melhor posição de stand, '
      'demonstração no horário de pico (8h–9h), logo em destaque como "Apoio Master" e citação na '
      'abertura. Evitar qualquer menção pública a valores. Pendência de julho: alinhar por escrito '
      'o que a Amanco espera em troca da verba, em especial confirmar que NÃO há expectativa de '
      'exclusividade no segmento hidráulico (participarão outros 5 fornecedores do segmento).'
  );

  insert into public.evento_fases (evento_id, ordem, periodo, fase, entregas, data_inicio, data_fim) values
    (v_evento_id, 1, '13–24/07', 'Definição',
     'Data, horário e local aprovados pela diretoria; nome do evento; meta de público; orçamento macro; alinhamento reservado com a Amanco.',
     date '2026-07-13', date '2026-07-24'),
    (v_evento_id, 2, '27/07–07/08', 'Abordagem',
     'Media kit pronto e enviado aos 11 fornecedores.',
     date '2026-07-27', date '2026-08-07'),
    (v_evento_id, 3, '10–31/08', 'Confirmação de fornecedores',
     'Follow-up por telefone; prazo final de adesão 31/08; ordem de confirmação define posição de stand.',
     date '2026-08-10', date '2026-08-31'),
    (v_evento_id, 4, '01–18/09', 'Produção',
     'Contratação do café; artes de convite, voucher e materiais; lista de convidados consolidada com João e Tatiane; recebimento das cotas até 30/09.',
     date '2026-09-01', date '2026-09-18'),
    (v_evento_id, 5, '21/09–09/10', 'Convites e RSVP',
     'Convite pessoal vendedor a vendedor; entrega de convites físicos aos "Perdidos"; emissão de vouchers nominais.',
     date '2026-09-21', date '2026-10-09'),
    (v_evento_id, 6, '05–13/10', 'Régua de presença',
     'Lembretes D-7 e D-2; confirmação logística com fornecedores (montagem, promotores, prêmios).',
     date '2026-10-05', date '2026-10-13'),
    (v_evento_id, 7, '14/10', 'Véspera',
     'Montagem de stands e infláveis no galpão a partir das 14h; briefing final com equipe e promotores.',
     date '2026-10-14', date '2026-10-14'),
    (v_evento_id, 8, '15/10', 'EVENTO',
     '7h30 às 10h — credenciamento, café, demonstrações, sorteios, fotos e venda no balcão.',
     date '2026-10-15', date '2026-10-15'),
    (v_evento_id, 9, '16–23/10', 'Pós-evento',
     'Agradecimentos; relatório aos fornecedores; follow-up comercial dos presentes; atualização do RFV.',
     date '2026-10-16', date '2026-10-23');

  insert into public.evento_tarefas (evento_id, grupo, ordem, titulo) values
    (v_evento_id, 'Julho', 1, 'Criar o media kit de 1 página para os fornecedores'),
    (v_evento_id, 'Julho', 2, 'Montar planilha de controle de fornecedores (status, cota, brindes, prêmio, promotor, estrutura)'),

    (v_evento_id, 'Agosto', 1, 'Conduzir os follow-ups com fornecedores em conjunto com o comercial'),
    (v_evento_id, 'Agosto', 2, 'Criar a identidade visual do evento (nome + arte base)'),

    (v_evento_id, 'Setembro', 1, 'Produzir arte do convite digital e do voucher nominal com numeração de sorteio'),
    (v_evento_id, 'Setembro', 2, 'Produzir convite físico para entrega em mãos aos clientes "Perdidos"'),
    (v_evento_id, 'Setembro', 3, 'Consolidar a lista final de convidados com João (B2B) e Tatiane (B2C)'),
    (v_evento_id, 'Setembro', 4, 'Contratar o serviço de café da manhã'),
    (v_evento_id, 'Setembro', 5, 'Montar o roteiro do evento: ordem das demonstrações e horários dos sorteios'),
    (v_evento_id, 'Setembro', 6, 'Produzir materiais de loja: cartazes, aviso no balcão e posts para redes sociais'),

    (v_evento_id, 'Outubro (pré-evento)', 1, 'Operar a régua de lembretes e monitorar quais vendedores ainda não contataram suas carteiras'),
    (v_evento_id, 'Outubro (pré-evento)', 2, 'Definir o mapa de stands do galpão (Amanco na posição principal)'),
    (v_evento_id, 'Outubro (pré-evento)', 3, 'Preparar checklist de véspera e briefing impresso para equipe e promotores'),

    (v_evento_id, 'Dia do evento (15/10)', 1, 'Credenciamento na entrada: conferência de confirmados, entrega do kit e do número de sorteio'),
    (v_evento_id, 'Dia do evento (15/10)', 2, 'Condução dos sorteios nos horários programados'),
    (v_evento_id, 'Dia do evento (15/10)', 3, 'Registro de fotos e vídeos para redes sociais e prestação de contas'),

    (v_evento_id, 'Pós-evento', 1, 'Mensagem de agradecimento a clientes e fornecedores, com fotos'),
    (v_evento_id, 'Pós-evento', 2, 'Mini relatório para cada fornecedor (público presente, fotos do stand)'),
    (v_evento_id, 'Pós-evento', 3, 'Repasse da lista de presentes ao comercial para follow-up em até 5 dias úteis'),
    (v_evento_id, 'Pós-evento', 4, 'Atualização do RFV, marcando os clientes "Perdidos" que compareceram');
end $$;
