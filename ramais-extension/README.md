# Ramais Carflax — Extensão de navegador

Extensão (Chrome / Edge) que deixa a **lista de ramais** sempre à mão na barra do
navegador. Ao clicar no ícone, abre um popup com busca por nome/ramal; um clique
copia o ramal. Os dados vêm **ao vivo** do Supabase (mesma base do Carflax HUB) e
ficam em cache local para abrir instantâneo / funcionar offline.

## Instalar (modo desenvolvedor — rápido)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `ramais-extension`.
4. Fixe o ícone (o "C" azul) na barra clicando no alfinete das extensões.

Para atualizar o código: edite os arquivos e clique em **Atualizar** na página de
extensões.

## Instalar em toda a empresa (opcional)

- **Google Admin / GPO**: publique o `.zip` como extensão forçada (force-install)
  apontando para o ID/URL, e ela aparece sozinha em todas as máquinas.
- **Chrome Web Store (não listada)**: envie o `.zip`, defina visibilidade
  "não listada" e compartilhe o link interno.

## Como funciona

- `manifest.json` — Manifest V3. Pede só `storage` (cache) e acesso ao host do
  Supabase.
- `popup.html` / `popup.js` — UI e a busca em `usuarios` (colunas `name`, `ramal`)
  via REST do Supabase com a **chave anônima** (a mesma já embutida no site; a
  leitura é liberada por RLS).
- O nome é reduzido para "primeiro nome + segunda palavra" (ex.: *João Paulo
  Vendramini* → *João Paulo*), igual à folha de ramais em PDF do HUB.

## Requisitos de dados

A RLS do Supabase precisa permitir leitura anônima de `name` e `ramal` na tabela
`usuarios` (já é o caso hoje). Quem tiver ramal cadastrado aparece na lista,
ordenado por nome.
