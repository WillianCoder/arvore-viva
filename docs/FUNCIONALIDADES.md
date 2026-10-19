# Funcionalidades — o que está concluído e o que falta

Legenda: ✅ concluído e testado · 🟡 parcial · ⛔ depende de serviço externo/configuração · ❌ não implementado

## Validação realizada
- `npm test`: 25 testes automatizados — unidades (CPF, nomes, parentesco, correspondência, GEDCOM, CSV, extração), API (cadastro/login, CSRF, árvores, pessoas, vínculos, ciclos, duplicidade, parentesco, busca, CPF, **isolamento entre usuários**, papéis, documentos, correspondências, importação/exportação, painel, demonstração, erros, administração) e desempenho com 3.000 pessoas.
- Navegador (Chromium): todas as telas percorridas em desktop e celular (360 px), temas claro e escuro, 2D e 3D, sem erros no console.

## Critérios de aceitação
| Critério | Situação |
|---|---|
| Criar e editar árvore | ✅ |
| Pessoas com múltiplos vínculos | ✅ (biológico, legal, adotivo, criação, tutela, cônjuges, uniões encerradas, irmandade, a confirmar) |
| Árvore 2D interativa | ✅ 8 organizações, zoom, arraste, teclado, filtros, recolher ramos, caminho, histórico |
| Árvore 3D com os mesmos dados | ✅ 3 estilos, câmera livre/focada, seleção, filtros, captura de imagem |
| Alternar 2D/3D preservando contexto | ✅ seleção, filtros e caminho mantidos |
| Busca com filtros e variações | ✅ |
| Parentesco explica o caminho | ✅ inclusive alternativas e afinidade |
| Documentos com permissões | ✅ 3 níveis de acesso, links temporários |
| Fontes sustentando relações | ✅ grafo de evidências |
| Correspondências revisadas antes de confirmar | ✅ nunca une automaticamente |
| Importação/exportação respeitando permissões | ✅ |
| Persistência após recarregar | ✅ SQLite |
| Controle de acesso no servidor | ✅ testado contra troca de parâmetros |
| Pessoas vivas protegidas | ✅ |
| Erros compreensíveis | ✅ mensagens em português, estados de erro com "Tentar novamente" |
| Testes aprovados | ✅ |
| Implantável pelas instruções | ✅ (Node + proxy HTTPS; Docker não testado no ambiente) |

## Por módulo
- ✅ Painel com indicadores reais, resumo da árvore, atalhos, atividades e pedidos de revisão.
- ✅ Cadastro completo de pessoas (identificação, nomes anteriores/apelidos/grafias, eventos, filiação, cônjuges, biografia, verificação, foto a partir de imagem anexada).
- ✅ Identificadores (CPF, RG, passaporte, certidões, estrangeiros) com validação de CPF, criptografia, máscara e revelação auditada.
- ✅ Detecção de duplicidade ao digitar e ao salvar; comparação lado a lado; união com confirmação.
- ✅ Correspondências: 6 categorias, fatores, faltantes, aceitar/rejeitar/adiar/desfazer, justificativa, histórico, inclusive entre suas árvores.
- ✅ Documentos: PDF/JPG/PNG/WEBP, 14 categorias, metadados completos, histórico de alterações, vínculos, citações.
- 🟡 Extração assistida: funciona com texto de PDF digital e transcrição digitada; ⛔ OCR de imagens requer Tesseract.
- ✅ Fontes, citações e catálogo de fontes externas legítimas (links oficiais).
- ✅ Linha do tempo (pessoa, ramo, período, tipo; ramos lado a lado; datas incertas sinalizadas).
- ✅ Mapa com rotas migratórias datadas; vivos com precisão reduzida; locais sem coordenadas listados.
- ✅ Relatórios (11 tipos) para impressão/PDF pelo navegador e CSV; paginação por geração; retrato/paisagem.
- ✅ Importação GEDCOM/CSV/JSON com validação, prévia, mapeamento, duplicidades, inconsistências, confirmação e histórico.
- ✅ Exportação GEDCOM/CSV/JSON por árvore ou ramo; vivos e identificadores excluídos por padrão; registro da operação.
- ✅ Colaboração: 5 papéis, convites com expiração, revogação, histórico de quem alterou, comentários, pedidos de revisão.
- 🟡 Aprovação de alterações sensíveis: feita por "pedido de revisão" + papéis; não há fila de aprovação que bloqueie a gravação.
- 🟡 Conflitos de edição: detecção de edição simultânea em pessoas (aviso para recarregar); sem mesclagem automática.
- 🟡 Permissões por registro: pessoa privada e nível de acesso por documento; não há lista de usuários por registro.
- ✅ Privacidade: dados da conta para download, exclusão de conta, explicação das proteções.
- ✅ Configurações: tema, reduzir movimento, 3D leve.
- ✅ Administração técnica: estado, backup, auditoria global, link de redefinição de senha, limpeza de arquivos.
- ✅ Dados de demonstração identificados, com botão para remover sem afetar registros reais.

## Pendências conhecidas
- ⛔ Envio de e-mails (verificação de conta, convites, recuperação de senha automática).
- ❌ Autenticação multifator.
- ⛔ OCR de imagens.
- 🟡 PDF é gerado pela impressão do navegador ("Salvar como PDF"), não por biblioteca no servidor.
- 🟡 Rede de relações por forças só até 1.500 pessoas (acima disso usa o layout por gerações).
- 🟡 O limite de requisições fica em memória (um único processo). Para vários servidores, usar um armazenamento compartilhado.
