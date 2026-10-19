# Árvore Viva — instruções para o Claude

Plataforma de genealogia (árvore 2D/3D, documentos, correspondências, privacidade).
Dono: Willian (leigo em programação). Responda e escreva tudo em **português do Brasil**.

## Preferência do Willian
- Todo projeto/site **novo** vai em um **repositório GitHub novo e separado**. Mudanças neste projeto ficam aqui.

## Arquitetura (detalhes em docs/ARQUITETURA.md)
- Servidor Node.js 22.13+ sem framework (`server/`), banco SQLite embutido (`node:sqlite`) com migrações em `server/migrations/NNN_nome.sql`.
- Única dependência npm: `three` (3D) e `leaflet` (mapa), servidas localmente em `/vendor/`.
- Frontend sem build: módulos ES em `public/js/` (`app.js` roteia por hash; telas em `public/js/views/`).
- Toda autorização acontece no servidor (`server/acesso.js`: `papelNaArvore`, `pessoaNaArvore`, `exigirEdicao`).

## Regras de código
- CSP rígido: nada de `<script>`/`<style>` inline, atributos `on...=` ou atributo `style` em SVG. Use classes CSS; estilo via `el.style` (CSSOM) é permitido.
- Texto sempre por `textContent` (`h(tag, { text })`), nunca `innerHTML`.
- Identificadores (CPF/RG) nunca em logs, URLs, mensagens de erro ou listas; só mascarados.
- Pessoa viva/privada passa por `restrita()`/`serializarPessoa()` antes de sair do servidor.
- Toda mudança de esquema = nova migração numerada (nunca editar uma já aplicada).
- Comentários curtos em português; siga o estilo dos arquivos vizinhos.

## Antes de terminar
- `npm test` precisa passar (unidades, API com isolamento entre usuários, desempenho).
- Teste no navegador: `npm start` e abra http://localhost:3000 (crie conta → "Carregar demonstração").
