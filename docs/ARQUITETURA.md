# Arquitetura

## Diagnóstico do ambiente (Etapa 1)

| Recurso | Situação | Decisão |
|---|---|---|
| Node.js 22 | disponível | Servidor em Node puro, sem framework |
| PostgreSQL | cliente instalado, servidor indisponível | **SQLite embutido** (`node:sqlite`), sem instalar nada |
| Docker | indisponível | Implantação direta com Node (ver IMPLANTACAO.md) |
| `pdftotext` | disponível | Extração do texto de PDFs digitais |
| Tesseract (OCR de imagens) | indisponível | Interface pronta; OCR de imagem sinalizado como "não configurado" |
| Servidor de e-mail | indisponível | Convites e redefinição por link copiado; nada é simulado |

O esquema é relacional e normalizado; migrar para PostgreSQL exige trocar `server/db.js` e ajustar poucos tipos (as consultas são SQL padrão).

## Camadas

```
navegador (public/)            servidor (server/)                       dados (data/)
 app.js  roteador por hash ──► http.js   rotas, CSP, limite, estáticos
 views/* telas                 acesso.js sessão, CSRF, papéis, auditoria
 tree2d.js  SVG virtualizado   routes/*  regras por módulo  ───────────► arvore.db (SQLite, WAL)
 tree3d.js  Three.js (lazy)    lib/*     parentesco, correspondência,   arquivos/*.bin (AES-256-GCM)
 layout.js  usado pelo 2D e 3D           nomes, CPF, GEDCOM, CSV        .chave (só em desenvolvimento)
```

## Modelo de dados (server/migrations/001_inicial.sql)

`users`, `sessions`, `family_trees`, `tree_memberships`, `persons`, `tree_persons` (pessoa ↔ árvore, sem duplicar), `person_names`, `person_identifiers`, `places`, `relationships`, `life_events`, `documents`, `document_links`, `sources`, `source_citations`, `evidence_items`, `match_candidates`, `match_reviews`, `comments`, `invitations`, `audit_logs`, `import_jobs`, `export_jobs`, `schema_migrations`.

- IDs são UUID v4. CPF nunca é chave.
- `relationships.type`: `parent` (A é genitor/responsável de B), `spouse`, `partner`, `guardian`, `sibling`, `unknown`; `subtype`: `biological`, `legal`, `adoptive`, `step`, `foster`, `unknown`; `status`: declarada, extraída, documentada, confirmada, contestada, hipótese.
- Exclusão lógica (`deleted_at`) em pessoas, vínculos, eventos, documentos e fontes; exclusão definitiva de árvore e de conta.
- `evidence_items` forma o grafo de evidências (documento → pessoa/vínculo/evento, sustenta ou contradiz).

## Segurança

- **Autorização no servidor** em toda rota: `papelNaArvore` (404 se não é membro, para não revelar a existência), `pessoaNaArvore` (a pessoa precisa estar na árvore da URL), `exigirEdicao` (colaborador só altera o que criou).
- **Pessoas vivas/privadas**: `serializarPessoa` remove dados para quem não é editor; busca e exportação também filtram.
- **Sessão**: token aleatório em cookie `HttpOnly; SameSite=Strict` (opcional `Secure`), só o hash SHA-256 fica no banco; token CSRF exigido em toda escrita; verificação de `Origin`.
- **Senhas**: scrypt (N=16384) com sal; bloqueio de 15 min após 8 erros; limite por IP.
- **Identificadores**: AES-256-GCM + HMAC para detectar duplicidade sem guardar o número em claro; busca exata só para editores, numa árvore, limitada e auditada.
- **Arquivos**: tipo real conferido pelos primeiros bytes (PDF/JPG/PNG/WEBP), limite de 10 MB, criptografados em disco, servidos por URL assinada de 5 min emitida para a conta, com `Content-Security-Policy: sandbox`.
- **Navegador**: CSP sem inline, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`; todo texto inserido por `textContent`.
- **SQL**: somente consultas parametrizadas.
- **CSV exportado**: proteção contra injeção de fórmulas.
- **Auditoria** sem valores sensíveis.

## Algoritmos

- **Busca**: normalização (acentos, partículas, abreviações), chave fonética para o português, Levenshtein; pontua e explica "por que apareceu".
- **Parentesco**: BFS de ancestrais; ancestrais comuns mínimos → nome do parentesco (graus de primo e "afastado N gerações"); meio-irmãos; afinidade (cônjuge, sogro, genro/nora, padrasto, enteado, cunhado); caminho por qualquer vínculo quando não há parentesco nomeável; avisos para vínculos adotivos, de criação ou não confirmados.
- **Correspondência**: pontuação 0–100 explicável (nome, sobrenome, datas, locais, pais, cônjuges, filhos, identificadores); bloqueio fonético para evitar comparar todos com todos; conflitos fortes (sexo, CPF diferente, datas incompatíveis) → "conflitante"/"improvável". Não é probabilidade calibrada.
- **Layout 2D**: gerações por maior distância da raiz, cônjuges alinhados, blocos de casais, varreduras de baricentro para reduzir cruzamentos e ajuste de posição sem sobreposição; radial com anéis que crescem para caber; rede por forças (até 1.500 nós).
- **2D virtualizado**: só desenha nós/arestas visíveis; abaixo de 35% de zoom desenha só retângulos.
- **3D**: `InstancedMesh` para os nós, `LineSegments` para vínculos, rótulos só para os 220 nós mais próximos, limite de 4.000 nós (acima disso mostra a linhagem selecionada).
